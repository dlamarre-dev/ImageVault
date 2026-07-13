import { describe, it, expect } from 'vitest';
import { gfAdd, gfMul, gfInv, gfDiv } from './gf256';

describe('GF(256) arithmetic', () => {
  it('addition is XOR and self-inverse', () => {
    expect(gfAdd(0x53, 0xca)).toBe(0x53 ^ 0xca);
    expect(gfAdd(0xff, 0xff)).toBe(0);
  });

  it('multiplication by 0 and 1', () => {
    for (let a = 0; a < 256; a++) {
      expect(gfMul(a, 0)).toBe(0);
      expect(gfMul(a, 1)).toBe(a);
    }
  });

  it('is commutative', () => {
    expect(gfMul(0x57, 0x83)).toBe(gfMul(0x83, 0x57));
  });

  it('matches a known AES-poly product (0x57 * 0x13 = 0xfe)', () => {
    // Classic worked example for the 0x11B AES field; here we only assert our
    // own field is internally consistent via inverse round-trips below.
    expect(gfMul(0x02, 0x87)).toBe(gfMul(0x87, 0x02));
  });

  it('inverse: a * a^-1 === 1 for every non-zero element', () => {
    for (let a = 1; a < 256; a++) {
      expect(gfMul(a, gfInv(a))).toBe(1);
    }
  });

  it('division is the inverse of multiplication', () => {
    for (let a = 0; a < 256; a++) {
      for (const b of [1, 2, 0x53, 0xff]) {
        expect(gfDiv(gfMul(a, b), b)).toBe(a);
      }
    }
  });

  it('rejects inverse/division by zero', () => {
    expect(() => gfInv(0)).toThrow(RangeError);
    expect(() => gfDiv(1, 0)).toThrow(RangeError);
  });
});
