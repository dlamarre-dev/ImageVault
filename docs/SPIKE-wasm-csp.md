# Spike: WebAssembly under the Manifest V3 CSP

**Goal (Init-phase success criterion):** confirm that our WASM dependencies — Argon2id
(`hash-wasm`, the KDF) and, by proxy, the Reed-Solomon WASM used later — load and execute
under the Manifest V3 content security policy in **both** contexts we rely on:

- the **service worker** (background), and
- the **offscreen document**.

The MV3 CSP for extension pages is:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

Without `'wasm-unsafe-eval'`, `WebAssembly.instantiate` is blocked. This spike verifies
the policy in `src/manifest.config.ts` is sufficient and that our bundling does not break
WASM instantiation.

## What the spike does

`src/spike/wasm-csp.ts` exposes `runWasmSpike(context)`, which:

1. Runs **Argon2id** via `hash-wasm` with cheap parameters (proves the real KDF's WASM
   executes — not a calibration).
2. Instantiates a **minimal hand-built WASM module** (`add(i32,i32)`) directly, as a
   stand-in for any other WASM (e.g. Reed-Solomon), proving generic instantiation.

It returns `{ context, argon2idOk, genericWasmOk, errors }`.

The background service worker (`src/background/index.ts`) runs it at startup and also
creates the offscreen document, which runs it too (`src/offscreen/offscreen.ts`) and
messages the result back.

## Run it (automated, Node)

Node has no CSP, so this only proves the libraries work end-to-end — but it runs in CI:

```bash
npm test -- wasm-csp
```

## Run it (manual, real browser — the actual CSP check)

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** → select
   `dist/chrome/`.
3. Open the service worker console: on the extension card, click **service worker**
   (or **Inspect views: service worker**).
4. You should see, with no CSP errors:
   ```
   [imagevault] spike (service-worker): { argon2idOk: true, genericWasmOk: true, errors: [] }
   [imagevault] spike (offscreen):      { argon2idOk: true, genericWasmOk: true, errors: [] }
   ```
   These are `console.log` lines (informational); they will not appear in the extension's
   Errors panel.
5. Repeat on Firefox: `npm run build:firefox`, then `about:debugging` → **This Firefox**
   → **Load Temporary Add-on** → pick `dist/firefox/manifest.json`. (Firefox has no
   offscreen API; only the background-context result is expected there.)

## Pass / fail

- **Pass:** both `argon2idOk` and `genericWasmOk` are `true` in every available context,
  with an empty `errors` array and no CSP violation in the console.
- **Fail:** any CSP error, or either flag `false`. If it fails, the architecture
  assumption (WASM crypto/erasure-coding in MV3) must be revisited **before Phase 1** —
  see the plan's risk section.

## Result log

Record outcomes here as the spike is validated:

| Date | Browser | Context | argon2idOk | genericWasmOk | Notes |
| ---- | ------- | ------- | ---------- | ------------- | ----- |
| _TBD_ | Chrome  | SW + offscreen | | | pending manual run |
| _TBD_ | Firefox | background     | | | pending manual run |
