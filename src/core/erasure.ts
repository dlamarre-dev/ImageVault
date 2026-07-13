/**
 * Turn a vault blob into a set of equal-length shards protected by Reed-Solomon
 * erasure coding, and reconstruct the blob from any k surviving shards.
 *
 * Parity is fixed at +30% with an absolute floor of MIN_PARITY (plan §2):
 *   m = max(ceil(k * 0.3), MIN_PARITY)
 * so even a tiny vault (k = 1) keeps at least two redundant shards.
 */

import { rsEncode, rsReconstructData } from './reed-solomon';

export const PARITY_RATIO = 0.3;
export const MIN_PARITY = 2;

/** Parity shard count for a given number of data shards. */
export function parityCount(k: number): number {
  return Math.max(Math.ceil(k * PARITY_RATIO), MIN_PARITY);
}

/** Split a blob into k equal-length shards, zero-padding the last one. */
export function splitIntoShards(blob: Uint8Array, k: number): Uint8Array[] {
  if (k < 1) throw new RangeError('erasure: k must be >= 1');
  const shardLen = Math.max(1, Math.ceil(blob.length / k));
  const shards: Uint8Array[] = [];
  for (let i = 0; i < k; i++) {
    const shard = new Uint8Array(shardLen);
    shard.set(blob.subarray(i * shardLen, (i + 1) * shardLen));
    shards.push(shard);
  }
  return shards;
}

/**
 * Encode a blob into k data + m parity shards (all the same length).
 * Returns the shards in global index order (data first, then parity).
 */
export function encodeShards(
  blob: Uint8Array,
  k: number,
  m: number,
): { shards: Uint8Array[]; shardLen: number } {
  const data = splitIntoShards(blob, k);
  const parity = rsEncode(data, m);
  const shards = [...data, ...parity];
  return { shards, shardLen: shards[0]!.length };
}

/**
 * Reconstruct the original blob from surviving shards.
 * `shards[i]` is the shard at global index i (0..k+m-1) or null if missing.
 */
export function decodeBlob(
  shards: (Uint8Array | null)[],
  k: number,
  m: number,
  blobLen: number,
): Uint8Array {
  const data = rsReconstructData(shards, k, m);
  const shardLen = data[0]!.length;
  const joined = new Uint8Array(k * shardLen);
  data.forEach((s, i) => joined.set(s, i * shardLen));
  return joined.subarray(0, blobLen);
}
