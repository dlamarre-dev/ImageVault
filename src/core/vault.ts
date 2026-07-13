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
  IV_LEN,
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
  PROFILE_DISK,
  decodeImagePayload,
  encodeImagePayload,
} from './header';
import { SET_ID_LEN } from './header';

/** Hard limit on the source file — this vault targets small secrets (plan §5). */
export const MAX_FILE_BYTES = 64 * 1024;
/** Independent safety ceiling on the number of images (plan §5). */
export const MAX_IMAGES = 50;
/** Target data bytes per shard; header + shard must fit one QR symbol. */
export const DATA_PER_SHARD = 1024;

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

/** How many images a source of `contentLen` bytes will need (rough, for UI). */
export function estimateImageCount(contentLen: number): number {
  // Worst case: no compression, + AES-GCM tag + iv + a ~90-byte key block.
  const approxBlob = contentLen + 16 + IV_LEN + 90 + 2;
  const k = Math.max(1, Math.ceil(approxBlob / DATA_PER_SHARD));
  return k + parityCount(k);
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

  const k = Math.max(1, Math.ceil(blob.length / DATA_PER_SHARD));
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
