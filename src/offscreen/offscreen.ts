/**
 * Offscreen document: the DOM-capable context where image rendering and
 * decoding (Canvas / OffscreenCanvas) will live, since the service worker has
 * no DOM. For the Init phase it runs the WASM/CSP spike and reports back.
 */

import browser from 'webextension-polyfill';
import { runWasmSpike } from '../spike/wasm-csp';

async function main(): Promise<void> {
  const result = await runWasmSpike('offscreen');
  console.log('[imagevault] spike (offscreen):', result);
  // Best-effort notification to the service worker; a messaging hiccup must not
  // surface as an uncaught rejection in the extension's error panel.
  try {
    await browser.runtime.sendMessage({ type: 'wasm-spike-result', payload: result });
  } catch (err) {
    console.log('[imagevault] could not notify service worker:', err);
  }
}

void main();
