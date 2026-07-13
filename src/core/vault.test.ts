import { describe, it, expect } from 'vitest';
import { type Argon2Params } from './crypto';
import {
  MAX_FILE_BYTES,
  estimateImageCount,
  estimateImages,
  exportVault,
  importVault,
} from './vault';

const TEST_PARAMS: Argon2Params = { iterations: 1, memoryKiB: 256, parallelism: 1 };

// Deterministic, incompressible content that spans several images.
function pseudoRandom(len: number, seed: number): Uint8Array {
  let s = seed >>> 0;
  return Uint8Array.from({ length: len }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 24) & 0xff;
  });
}

describe('vault export/import round-trip (byte level)', () => {
  it('restores a small file from the full image set', async () => {
    const content = new TextEncoder().encode('seed phrase: alpha bravo charlie');
    const { imagePayloads } = await exportVault('seed.txt', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });
    const out = await importVault(imagePayloads, 'pw');
    expect(out.filename).toBe('seed.txt');
    expect(new TextDecoder().decode(out.content)).toBe('seed phrase: alpha bravo charlie');
  });

  it('spans multiple images and restores exactly', async () => {
    const content = pseudoRandom(3000, 42);
    const { imagePayloads, k, m } = await exportVault('blob.bin', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });
    expect(k).toBeGreaterThan(1);
    expect(imagePayloads.length).toBe(k + m);
    const out = await importVault(imagePayloads, 'pw');
    expect([...out.content]).toEqual([...content]);
  });

  it('restores after losing up to m images, in any order', async () => {
    const content = pseudoRandom(3000, 7);
    const { imagePayloads, k, m } = await exportVault('blob.bin', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });

    // Drop the first m images and shuffle the rest.
    const survivors = imagePayloads.slice(m).reverse();
    expect(survivors.length).toBe(k); // exactly k left — the minimum
    const out = await importVault(survivors, 'pw');
    expect([...out.content]).toEqual([...content]);
  });

  it('fails to restore when more than m images are lost', async () => {
    const content = pseudoRandom(3000, 9);
    const { imagePayloads, m } = await exportVault('blob.bin', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });
    const tooFew = imagePayloads.slice(m + 1); // one below k
    await expect(importVault(tooFew, 'pw')).rejects.toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const content = new TextEncoder().encode('secret');
    const { imagePayloads } = await exportVault('s.txt', content, 'right', {
      argon2Params: TEST_PARAMS,
    });
    await expect(importVault(imagePayloads, 'wrong')).rejects.toBeTruthy();
  });

  it('enforces the hard file-size limit', async () => {
    const tooBig = new Uint8Array(MAX_FILE_BYTES + 1);
    await expect(
      exportVault('big.bin', tooBig, 'pw', { argon2Params: TEST_PARAMS }),
    ).rejects.toThrow(/too large/);
  });
});

describe('estimateImageCount (rough, sync)', () => {
  it('grows with content size and stays >= 3 (k>=1 + MIN_PARITY)', () => {
    expect(estimateImageCount(10)).toBeGreaterThanOrEqual(3);
    expect(estimateImageCount(5000)).toBeGreaterThan(estimateImageCount(10));
  });
});

describe('estimateImages (accurate)', () => {
  it('matches the actual image count for incompressible content', async () => {
    const content = pseudoRandom(4000, 5);
    const est = await estimateImages('x.bin', content);
    const { imagePayloads } = await exportVault('x.bin', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });
    expect(est.images).toBe(imagePayloads.length);
  });

  it('reflects compression: a compressible file needs fewer images than the worst case', async () => {
    const content = new Uint8Array(20000).fill(65); // highly compressible
    const est = await estimateImages('big.txt', content);
    const { imagePayloads } = await exportVault('big.txt', content, 'pw', {
      argon2Params: TEST_PARAMS,
    });
    expect(est.images).toBe(imagePayloads.length);
    expect(est.images).toBeLessThan(estimateImageCount(content.length));
  });
});
