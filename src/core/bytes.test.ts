import { describe, it, expect } from 'vitest';
import { concatBytes, readU16, readU32, writeU16, writeU32 } from './bytes';

describe('concatBytes', () => {
  it('joins parts in order', () => {
    const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3]));
    expect([...out]).toEqual([1, 2, 3]);
  });

  it('returns an empty array with no parts', () => {
    expect(concatBytes().length).toBe(0);
  });
});

describe('u16 round-trip', () => {
  it('writes and reads big-endian', () => {
    const buf = new Uint8Array(2);
    writeU16(buf, 0, 0xabcd);
    expect([...buf]).toEqual([0xab, 0xcd]);
    expect(readU16(buf, 0)).toBe(0xabcd);
  });

  it('rejects out-of-range values', () => {
    expect(() => writeU16(new Uint8Array(2), 0, 0x10000)).toThrow(RangeError);
  });

  it('throws when reading past the end', () => {
    expect(() => readU16(new Uint8Array(1), 0)).toThrow(RangeError);
  });
});

describe('u32 round-trip', () => {
  it('writes and reads big-endian, including the high bit', () => {
    const buf = new Uint8Array(4);
    writeU32(buf, 0, 0xdeadbeef);
    expect([...buf]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(readU32(buf, 0)).toBe(0xdeadbeef);
  });

  it('rejects out-of-range values', () => {
    expect(() => writeU32(new Uint8Array(4), 0, 0x1_0000_0000)).toThrow(RangeError);
  });
});
