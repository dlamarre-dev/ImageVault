# Threat model

What StegoShard defends, what it deliberately does not, and against whom. This is the
reader-facing companion to the [cryptographic review dossier](CRYPTO-REVIEW.md), which
carries the primitive-level detail (claims → enforcement → tests). If you want the *why*
behind the two-model design, read [WHY.md](WHY.md).

StegoShard offers two storage models with **different security goals**, so it has two
threat models. Confusing them is the main way to misuse the tool.

## Assets

There are two distinct assets, and they are not protected by the same model:

1. **The secret's contents** — the plaintext file. Protected by **encryption** in every
   mode (zero-knowledge: an Argon2id-derived key never leaves your device).
2. **The fact that a secret exists at all** — its *observability*. Protected only by
   **Deniable Storage** (and the deniable half of Hybrid). Resilient Storage makes no
   attempt to hide it.

Confidentiality of contents rests on the cryptographic core and is out of scope for this
document beyond a pointer: see [CRYPTO-REVIEW.md](CRYPTO-REVIEW.md). This document is about
the *second* asset — observability — which is where the two models diverge.

## Adversaries

| Adversary | Capability |
| --------- | ---------- |
| **Opportunistic finder** | Stumbles on the carrier (a lost USB stick, a shared drive, a folder listing). Glances, triages by file type, moves on. |
| **Cloud / platform** | Stores or transmits the carrier and may **re-encode** it (a social network recompresses uploaded photos; a chat app strips metadata). |
| **Forensic examiner** | Has the file and dedicated tools; will open it, run steganalysis, and look for statistical tells. |
| **Coercive adversary** | Can **compel** you to produce passwords or explain files ("rubber-hose"). Deniability, not cryptography, is your only lever here. |

## What each model defends against

### 🛡 Resilient Storage

**Goal: never lose the data.** Defends against:

- **Data loss and media degradation** — Reed-Solomon erasure coding tolerates losing up
  to `m` of the `k+m` images (a torn page, a deleted album item, an unreadable code).
- **Single-support failure** — the same vault can live on disk, on paper, and in the cloud
  at once; no one copy is trusted.
- **Recompression and printing** — the image profiles are built to survive re-encoding and
  a print/scan round-trip.

**Does not defend against observability.** The output is *openly* a StegoShard vault
(coded-noise images, or a `.ssbn` file). Anyone who sees it knows a secret exists. That is
deliberate — resilience and concealment are incompatible (see [WHY.md](WHY.md)).

### 🎭 Deniable Storage

**Goal: hide that the secret exists.** Its strength depends on the carrier, and the two
carriers fail in different ways:

- **Ordinary photos** (stego key / Gallery Mode) — strongest existence-hiding: the output
  looks like unremarkable photos. **Fragile:** any re-encoding (a social-network upload, a
  format conversion) destroys the payload. Defeats the opportunistic finder; is **not**
  claimed to defeat a forensic examiner running steganalysis.
- **Decoy database** (`.db`) — survives copying and byte-exact storage, and passes
  file-type triage as an ordinary SQLite database. Its deniability is **shallow**: a tool
  that actually opens and inspects the database can find tells. Defeats triage, not a
  determined examiner.

### 🔗 Hybrid

Combines the two: the bulk archive uses Resilient Storage, and **only the recovery key**
uses Deniable Storage. The key channel is **expendable by design** — if the cover photo is
recompressed, you lose the key, not the data (keep a copy of the key by another means if
that matters to you). Existence-hiding applies to the *key photo*; the resilient images
themselves are still openly a vault.

## Deliberate non-goals

StegoShard does **not** claim, and you should not rely on:

- **Steganographic indistinguishability against a dedicated forensic adversary.** Deniable
  Storage defeats triage and casual inspection, not targeted steganalysis. The content-tell
  of the decoy database is a known, documented limitation (see
  [ROADMAP.md](ROADMAP.md) → *Later / exploratory*).
- **Protection once you are compelled and the resilient vault is found.** Resilient Storage
  is openly a secret; against coercion, only the deniable models help, and only to the
  extent the carrier truly blends in.
- **Authenticated-vault / anti-tampering guarantees.** An attacker with write access can
  destroy or replace a vault wholesale; decryption under a wrong key *fails* (GCM tag)
  rather than yielding wrong plaintext, but the format does not bind key blocks to
  ciphertext. See [CRYPTO-REVIEW.md §7](CRYPTO-REVIEW.md).
- **Hiding metadata you supply.** Human-readable labels, PDF titles, and instruction
  sheets are conveniences for Resilient Storage; they are the opposite of deniable. Do not
  use them in Deniable mode.
- **Inventing cryptography.** The core is standard symmetric primitives only (Argon2id,
  AES-256-GCM, HKDF-SHA256); no asymmetric crypto, hence no Shor exposure. See
  [CRYPTO-REVIEW.md §9](CRYPTO-REVIEW.md).

## Choosing correctly

- Need it to **survive**? Resilient Storage. Accept that its existence is visible.
- Need **nobody to know it exists**? Deniable Storage. Accept that it is fragile (photos)
  or shallowly deniable (decoy database), and keep secrets small.
- Need **both**, for a large secret? Hybrid — resilient archive, deniable key — and treat
  the key channel as disposable.

See also: [WHY.md](WHY.md) · [README](../README.md) · [SPEC.md](../SPEC.md) ·
[CRYPTO-REVIEW.md](CRYPTO-REVIEW.md).
