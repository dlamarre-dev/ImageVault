/**
 * Init-phase spike: prove that WebAssembly runs under the Manifest V3 CSP
 * (`script-src 'self' 'wasm-unsafe-eval'`) in BOTH execution contexts we depend
 * on — the service worker and the offscreen document.
 *
 * Two things are exercised:
 *  1. Argon2id via hash-wasm — the real KDF the crypto layer will use (plan §4).
 *  2. A hand-built minimal WASM module instantiated directly — a stand-in for
 *     the Reed-Solomon WASM (plan §2), proving generic instantiation works.
 *
 * If either throws under CSP, the architecture assumption in the plan is wrong
 * and must be revisited BEFORE Phase 1. Run it from each context and read the
 * result; see docs/SPIKE-wasm-csp.md.
 */

import { argon2id } from 'hash-wasm';

/**
 * Minimal valid WASM module exporting `add(i32, i32) -> i32`.
 * Stands in for any real WASM (e.g. Reed-Solomon) to confirm that direct
 * `WebAssembly.instantiate` is permitted under the extension CSP.
 */
// prettier-ignore
const MINIMAL_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // type: (i32,i32)->i32
  0x03, 0x02, 0x01, 0x00, // function section
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // export "add"
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b, // code: local.get 0/1; i32.add
]);

export interface WasmSpikeResult {
  context: string;
  argon2idOk: boolean;
  argon2idHashPrefix?: string | undefined;
  genericWasmOk: boolean;
  errors: string[];
}

export async function runWasmSpike(context: string): Promise<WasmSpikeResult> {
  const errors: string[] = [];
  let argon2idOk = false;
  let argon2idHashPrefix: string | undefined;
  let genericWasmOk = false;

  try {
    // Deliberately cheap parameters — this only checks that the WASM executes,
    // not the production KDF calibration (that is tuned in Phase 1/2).
    const hash = await argon2id({
      password: 'spike-password',
      salt: new Uint8Array(16),
      parallelism: 1,
      iterations: 2,
      memorySize: 256, // KiB
      hashLength: 32,
      outputType: 'hex',
    });
    argon2idOk = typeof hash === 'string' && hash.length === 64;
    argon2idHashPrefix = hash.slice(0, 12);
  } catch (err) {
    errors.push(`argon2id: ${String(err)}`);
  }

  try {
    const { instance } = await WebAssembly.instantiate(MINIMAL_WASM, {});
    const add = instance.exports.add as (a: number, b: number) => number;
    genericWasmOk = add(40, 2) === 42;
  } catch (err) {
    errors.push(`generic wasm: ${String(err)}`);
  }

  return { context, argon2idOk, argon2idHashPrefix, genericWasmOk, errors };
}
