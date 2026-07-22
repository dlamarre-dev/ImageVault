import { describe, it, expect } from 'vitest';
import {
  GENERATED_PASSPHRASE_BITS,
  generatePassphrase,
  passwordStrength,
} from './password';

describe('generatePassphrase', () => {
  it('has the documented shape and entropy', () => {
    const p = generatePassphrase();
    expect(p).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(GENERATED_PASSPHRASE_BITS).toBe(100);
    // No confusable characters (I, L, O, U) leak into the alphabet.
    expect(p.replace(/-/g, '')).not.toMatch(/[ILOU]/);
  });

  it('is drawn fresh each call (no repeats across a large sample)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generatePassphrase());
    expect(seen.size).toBe(500);
  });
});

describe('passwordStrength', () => {
  it('scores an empty password as zero', () => {
    expect(passwordStrength('')).toEqual({ bits: 0, score: 0 });
  });

  it('rates longer, more diverse passwords higher', () => {
    const weak = passwordStrength('password');
    const strong = passwordStrength('Tr0ub4dour&3-Xk9!qZ');
    expect(strong.bits).toBeGreaterThan(weak.bits);
    expect(strong.score).toBeGreaterThanOrEqual(weak.score);
  });

  it('damps repeated-character runs below an equal-length diverse string', () => {
    const run = passwordStrength('aaaaaaaaaaaa');
    const diverse = passwordStrength('ax9Kd2mQ7rLp');
    expect(run.bits).toBeLessThan(diverse.bits);
  });

  it('rates a generated passphrase as strong', () => {
    expect(passwordStrength(generatePassphrase()).score).toBeGreaterThanOrEqual(3);
  });
});
