/**
 * Non-image "binary" delivery (SPEC §8): instead of erasure-coding the vault
 * blob (or a key block) into QR images, wrap it in a single opaque file. Two
 * variants trade findability for deniability:
 *
 *   - 'branded'   → [ MAGIC "SSBN" 4 ][ VERSION 1 ][ payload ]. A self-labelling
 *                   blob; easy for the owner to recognize, makes no attempt to
 *                   hide (extension .ssbn).
 *   - 'disguised' → [ complete SQLite DB ][ payload ]. Prepends a real, small
 *                   SQLite database (a `notes` table with innocuous dummy rows);
 *                   the payload is appended after the DB's last page. SQLite reads
 *                   only `page_count` pages and ignores trailing bytes, so the file
 *                   opens cleanly in `sqlite3` and shows the dummy table (.db).
 *                   Deniability against a casual *open*, still not a forensic
 *                   adversary (see docs/CRYPTO-REVIEW.md §6b).
 *
 * The payload is already an authenticated ciphertext (vault blob) or a wrapped
 * key block, so the wrapper adds no secrecy — only packaging. Unwrapping a file
 * that is neither variant returns null; callers may then treat the bytes as a
 * bare payload (e.g. a raw .key), letting AES-GCM be the final arbiter.
 */

import { concatBytes, fromBase64 } from './bytes';

export type BinaryVariant = 'branded' | 'disguised';

/** "SSBN" — StegoShard BiNary container. */
export const BINARY_MAGIC = Uint8Array.from([0x53, 0x53, 0x42, 0x4e]);
export const BINARY_VERSION = 1;

/**
 * A complete, valid SQLite 3 database (1024 bytes, two 512-byte pages) with a
 * `notes` table holding a few innocuous dummy rows. Used as the 'disguised'
 * prefix: the vault blob is appended after page 2. The header's page-count
 * (offset 28) equals the real page count and its change-counter (24) equals the
 * version-valid-for (96), so SQLite trusts the page count and ignores the
 * appended bytes — `sqlite3 cache.db "SELECT * FROM notes"` opens and lists the
 * dummy rows. A frozen constant (generated once with sqlite3; not regenerated).
 */
const SQLITE_TEMPLATE = fromBase64(
  'U1FMaXRlIGZvcm1hdCAzAAIAAQEAQCAgAAAAAwAAAAIAAAAAAAAAAAAAAAIAAAAEAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAC6GKQ0AAAABAaUAAaUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFkBBxcXFwGBEXRhYmxlbm90ZXNub3RlcwJDUkVBVEUgVEFCTEUgbm90ZXMgKGlkIElOVEVHRVIgUFJJTUFSWSBLRVksIHRpdGxlIFRFWFQsIGJvZHkgVEVYVCkNAAAAAwGAAAHYAaoBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAwQAF0tJZGVhc3dlZWtlbmQgaGlrZTsgcmVwYWludCB0aGUgZmVuY2UsAgQAFVVUb2RvY2FsbCB0aGUgcGx1bWJlcjsgcmVuZXcgbGlicmFyeSBjYXJkJgEEAB8/R3JvY2VyaWVzbWlsaywgZWdncywgYnJlYWQsIGNvZmZlZQ==',
);
/** Distinguishing head (the DB header) — a stable signature within a 128-byte peek. */
const SQLITE_DETECT = SQLITE_TEMPLATE.slice(0, 100);

const BRANDED_PREFIX_LEN = BINARY_MAGIC.length + 1; // magic + version

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

/** Wrap an already-encrypted payload in the chosen container variant. */
export function wrapBinary(payload: Uint8Array, variant: BinaryVariant): Uint8Array {
  if (variant === 'branded') {
    return concatBytes(BINARY_MAGIC, Uint8Array.of(BINARY_VERSION), payload);
  }
  return concatBytes(SQLITE_TEMPLATE, payload);
}

/**
 * Strip a container back to its payload. Returns the detected variant, or null
 * when the bytes match neither container (the caller decides whether to treat
 * them as a bare payload).
 */
export function unwrapBinary(
  bytes: Uint8Array,
): { payload: Uint8Array; variant: BinaryVariant } | null {
  if (startsWith(bytes, BINARY_MAGIC)) {
    const version = bytes[BINARY_MAGIC.length];
    if (version !== BINARY_VERSION)
      throw new Error(`binary container: unsupported version ${version}`);
    return { payload: bytes.slice(BRANDED_PREFIX_LEN), variant: 'branded' };
  }
  // Detect on the DB header (fits a 128-byte peek); strip the whole template.
  if (startsWith(bytes, SQLITE_DETECT)) {
    return { payload: bytes.slice(SQLITE_TEMPLATE.length), variant: 'disguised' };
  }
  return null;
}

/** File extension conventionally paired with each variant. */
export function binaryExtension(variant: BinaryVariant): string {
  return variant === 'branded' ? 'ssbn' : 'db';
}

/**
 * Conventional filenames for the single-file artifacts. Branded names announce
 * the project; disguised names impersonate ordinary app databases so a folder
 * listing raises no flags. Shared across the CLI and the web/extension app.
 */
export function binaryVaultName(variant: BinaryVariant): string {
  return variant === 'branded' ? 'stegoshard-vault.ssbn' : 'cache.db';
}
export function binaryKeyName(variant: BinaryVariant): string {
  return variant === 'branded' ? 'stegoshard-key.ssbn' : 'settings.db';
}
