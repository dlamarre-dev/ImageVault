import { describe, it, expect } from 'vitest';
import { runWasmSpike } from './wasm-csp';

// Under Node this proves the WASM libraries themselves work end-to-end. The
// Manifest V3 CSP dimension can only be validated in a real browser context —
// see docs/SPIKE-wasm-csp.md for that manual step.
describe('WASM spike (Node context)', () => {
  it('runs Argon2id and a generic WASM module without errors', async () => {
    const result = await runWasmSpike('node');
    expect(result.errors).toEqual([]);
    expect(result.argon2idOk).toBe(true);
    expect(result.genericWasmOk).toBe(true);
  });
});
