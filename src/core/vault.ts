/**
 * Vault orchestration: the offline pipeline that turns a file into a set of
 * self-describing image payloads and back (plan §0).
 *
 *   EXPORT: file → envelope → encrypt (DEK) → vault blob → erasure code
 *           → per-image payloads (header || shard)
 *   IMPORT: image payloads → reassemble shards → Reed-Solomon reconstruct
 *           → vault blob → decrypt → file
 *
 * This module works purely on bytes: rendering a payload to pixels (and back)
 * is the codec's job (see codec/), and the disk profile is lossless so the
 * codec is an identity over these bytes. Missing-image tolerance is a property
 * of the erasure coding and is exercised here at the byte level.
 *
 * Phase 1 uses the "embedded" key mode: the wrapped DEK block travels inside the
 * vault blob, so the images plus the password are self-sufficient. Separate
 * keyfile / stego modes arrive in Phase 2.
 */

import { concatBytes, readU16, writeU16 } from './bytes';
import {
  type Argon2Params,
  DEFAULT_ARGON2,
  createKeyBlock,
  decryptBytes,
  encryptBytes,
  GCM_TAG_LEN,
  IV_LEN,
  KEY_BLOCK_LEN,
  parseKeyBlock,
  serializeKeyBlock,
  unlockKeyBlock,
} from './crypto';
import { buildPayload, parsePayload } from './payload';
import { decodeBlob, encodeShards, parityCount } from './erasure';
import {
  CODEC_QR_GRID,
  type Header,
  HASH_LEN,
  HEADER_LEN,
  PROFILE_DISK,
  decodeImagePayload,
  encodeImagePayload,
} from './header';
import { SET_ID_LEN } from './header';
import { getCodec } from './codec';

/** Hard limit on the source file — this vault targets small secrets (plan §5). */
export const MAX_FILE_BYTES = 64 * 1024;
/** Independent safety ceiling on the number of images (plan §5). */
export const MAX_IMAGES = 50;

/** Bytes of shard data that fit one image for a codec/profile (header aside). */
function dataPerShard(codecId: number, profile: number): number {
  return getCodec(codecId).capacity(profile) - HEADER_LEN;
}

/** Analytical vault blob length for a given plaintext envelope length. */
function blobLenFor(envelopeLen: number): number {
  // [ KB_LEN u16 ][ key block ][ IV ][ ciphertext = envelope + GCM tag ]
  return 2 + KEY_BLOCK_LEN + IV_LEN + envelopeLen + GCM_TAG_LEN;
}

export interface ExportOptions {
  profile?: number;
  codecId?: number;
  argon2Params?: Argon2Params;
}

export interface ExportResult {
  /** One payload per image (header || shard), in global shard-index order. */
  imagePayloads: Uint8Array[];
  k: number;
  m: number;
  setId: Uint8Array;
}

async function sha256Short(data: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest).slice(0, HASH_LEN);
}

/** vault blob = [ KB_LEN u16 ][ keyBlock ][ IV 12 ][ ciphertext ] */
function serializeVaultBlob(keyBlock: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const lenField = new Uint8Array(2);
  writeU16(lenField, 0, keyBlock.length);
  return concatBytes(lenField, keyBlock, iv, ciphertext);
}

function parseVaultBlob(blob: Uint8Array): {
  keyBlock: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  const kbLen = readU16(blob, 0);
  let o = 2;
  const keyBlock = blob.slice(o, o + kbLen);
  o += kbLen;
  const iv = blob.slice(o, o + IV_LEN);
  o += IV_LEN;
  const ciphertext = blob.slice(o);
  return { keyBlock, iv, ciphertext };
}

/**
 * Rough worst-case image count from a content length alone (no compression
 * assumed). Useful for a synchronous ceiling; prefer `estimateImages` for an
 * accurate figure, since compression often reduces the real count sharply.
 */
export function estimateImageCount(
  contentLen: number,
  profile: number = PROFILE_DISK,
  codecId: number = CODEC_QR_GRID,
): number {
  const blobLen = blobLenFor(contentLen + 64); // + small filename allowance
  const k = Math.max(1, Math.ceil(blobLen / dataPerShard(codecId, profile)));
  return k + parityCount(k);
}

/**
 * Accurate image count: compresses the content exactly as export would, so the
 * figure matches what `exportVault` produces (differing only if compression is
 * nondeterministic, which gzip is not here).
 */
export async function estimateImages(
  filename: string,
  content: Uint8Array,
  options: ExportOptions = {},
): Promise<{ k: number; m: number; images: number }> {
  const profile = options.profile ?? PROFILE_DISK;
  const codecId = options.codecId ?? CODEC_QR_GRID;
  const envelope = await buildPayload(filename, content);
  const blobLen = blobLenFor(envelope.length);
  const k = Math.max(1, Math.ceil(blobLen / dataPerShard(codecId, profile)));
  const m = parityCount(k);
  return { k, m, images: k + m };
}

export async function exportVault(
  filename: string,
  content: Uint8Array,
  password: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  if (content.length > MAX_FILE_BYTES) {
    throw new RangeError(
      `file too large: ${content.length} bytes (limit ${MAX_FILE_BYTES}); this vault targets small secrets`,
    );
  }
  const profile = options.profile ?? PROFILE_DISK;
  const codecId = options.codecId ?? CODEC_QR_GRID;
  const params = options.argon2Params ?? DEFAULT_ARGON2;

  const envelope = await buildPayload(filename, content);
  const { dek, block } = await createKeyBlock(password, params);
  const { iv, ciphertext } = await encryptBytes(dek, envelope);
  const blob = serializeVaultBlob(serializeKeyBlock(block), iv, ciphertext);

  const k = Math.max(1, Math.ceil(blob.length / dataPerShard(codecId, profile)));
  const m = parityCount(k);
  const total = k + m;
  if (total > MAX_IMAGES) {
    throw new RangeError(`would need ${total} images (limit ${MAX_IMAGES})`);
  }

  const { shards, shardLen } = encodeShards(blob, k, m);
  const setId = globalThis.crypto.getRandomValues(new Uint8Array(SET_ID_LEN));
  const hash = await sha256Short(blob);

  const imagePayloads = shards.map((shard, shardIndex) => {
    const header: Header = {
      version: 1,
      setId,
      shardIndex,
      k,
      m,
      codecId,
      profile,
      shardLen,
      blobLen: blob.length,
      hash,
    };
    return encodeImagePayload(header, shard);
  });

  return { imagePayloads, k, m, setId };
}

/**
 * Reconstruct the original file from decoded image payloads. Payloads may be a
 * subset of the set and may arrive in any order; up to `m` may be missing.
 */
export async function importVault(
  payloads: Uint8Array[],
  password: string,
): Promise<{ filename: string; content: Uint8Array }> {
  if (payloads.length === 0) throw new Error('import: no images provided');

  const decoded = payloads.map(decodeImagePayload);
  const first = decoded[0]!.header;
  const { k, m, blobLen } = first;

  // Place each shard at its global index; ignore foreign sets.
  const slots: (Uint8Array | null)[] = new Array(k + m).fill(null);
  for (const { header, shard } of decoded) {
    if (!sameSet(header.setId, first.setId)) continue;
    if (header.shardIndex < k + m) slots[header.shardIndex] = shard;
  }

  const blob = decodeBlob(slots, k, m, blobLen);
  const hash = await sha256Short(blob);
  if (!bytesEqual(hash, first.hash)) {
    throw new Error('import: reconstructed blob failed its integrity check');
  }

  const { keyBlock, iv, ciphertext } = parseVaultBlob(blob);
  const dek = await unlockKeyBlock(parseKeyBlock(keyBlock), password);
  const envelope = await decryptBytes(dek, iv, ciphertext);
  return parsePayload(envelope);
}

function sameSet(a: Uint8Array, b: Uint8Array): boolean {
  return bytesEqual(a, b);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
