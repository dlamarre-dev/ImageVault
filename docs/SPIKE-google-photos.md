# Spike: Google Photos recompression (Phase 4 gate)

**Question:** does the vault survive Google Photos, which re-encodes uploads as
JPEG? The plan requires validating this **before** building the upload/OAuth
path.

## Method

`src/spike/gp-recompression.test.ts` (runs in CI) renders a Cloud-profile QR,
puts it through a JPEG round-trip (jpeg-js) at Google-Photos-like qualities, and
checks the codec still decodes. Google Photos preserves luminance, subsamples
chroma 4:2:0, and downscales only very large images — our QR is black/white
(pure luminance), so chroma loss is irrelevant; the JPEG quality/quantization is
the real threat.

## Verdict

✅ **The Cloud profile (QR ECC level Q, large modules) survives.** It decodes
losslessly after a JPEG round-trip at qualities **92, 85, and 75**. Google Photos
generally recompresses at the higher end of this range, so there is comfortable
margin. This clears the Phase 4 gate: Google Photos is a viable *optional*
destination.

✅ **A classic LSB does not survive JPEG.** Low-bit data is scrambled to roughly
chance level by an 85-quality JPEG. This confirms the plan's pessimistic
assumption (§4): the *invisible* stego profile is **disk-only** (lossless PNG);
"invisible + survives Google Photos" is not achievable with a naive LSB. Stego
remains deferred; if/when it lands, its robust profile would use the Cloud codec
(visible), not LSB.

## Caveats

- This is a *simulation*. jpeg-js approximates Google Photos' encoder; the real
  service may differ in quantization tables and any resampling. A **live
  round-trip** (upload → download → decode) must confirm this once OAuth is
  configured. The Cloud profile's ECC and the cross-image erasure coding provide
  additional margin beyond a single-image decode.
- Google Photos as data storage is **fragile on ToS grounds** and must never be
  the only copy — Disk and Paper do not depend on it (plan §11).

## Next (implementation, externally gated)

Building the live destination requires infrastructure only the repository owner
can provision:

1. A **Google Cloud project** with the Photos Library API and Photos Picker API
   enabled.
2. An **OAuth client** (the client id is configured, not committed).
3. **Google app verification** for the sensitive `photoslibrary.appendonly`
   scope before non-test users can use it.

Planned flow: optional `identity` permission requested on demand → OAuth via
`browser.identity.launchWebAuthFlow` → upload PNGs (`appendonly`) into a
dedicated album → restore by selecting them with the **Picker API**
(`photospicker.mediaitems.readonly`), decoding with the Cloud profile.
