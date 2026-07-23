# Changelog

All notable changes to StegoShard are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/) for the app/CLI version. The **on-disk
format** is versioned separately — see [docs/VERSIONING.md](docs/VERSIONING.md).

## [Unreleased]

## [0.9.0] - 2026-07-23

First tagged pre-1.0 release. Consolidates a round of hardening, reliability, and
maturity work. The on-image format stays **v1** (`FORMAT_VERSION = 1`); the
disguised-container internals changed but the branded/disguised **detection** and
the vault blob are unchanged.

### Added

- **Post-save round-trip verification.** Every save now decodes its own artifacts
  and decrypts them with the in-hand key **before** reporting success, so an
  encoding or lossy-carrier fault is caught at save time, not at a future restore.
- **Recovery guidance.** After a save, both UIs show a "to restore, keep: …"
  checklist, with a prominent lossless-storage caution for the fragile LSB carriers.
- **Password strength meter + one-click strong passphrase** generator (UX only).
- **Deniable / Overt mode labels** on save destinations (guided and expert UIs).
- **Post-quantum crypto scanning** in CI (CSNP QRAMM cryptoscan + cryptodeps) with
  a documented `.cryptoscan.yaml` baseline; a CBOM is emitted as a build artifact.
- **Parser fuzzing**: `npm run fuzz` plus a nightly CI job over every
  untrusted-input parser.
- First-run onboarding explaining deniable vs. overt modes.

### Changed

- **Argon2id defaults raised to 256 MiB / t=4** (from 64 MiB / t=3).
- **Disguised SQLite container** now stores the vault *inside* a valid database
  (rows of a `cache` table under an interior b-tree, no trailing bytes) instead of
  appended after a stub, and spreads it across several rows.
- Coverage gate raised (branches 80 → 85); dev dependencies updated (Vitest 4,
  Vite 8, ESLint 10, TypeScript toolchain, GitHub Actions).

### Security

- **Per-export content key**: content is encrypted under
  `HKDF-SHA256(DEK, salt=contentSalt)`, so the AES-GCM IV-collision bound is
  per-export even though the DEK is reused across vaults.
- **Per-cover stego nonce**: the key-block stego keystream is bound to a
  fingerprint of the cover, ending whitening/position reuse under a shared password.
- Purged leftover "ImageVault" identifiers (one was a latent Google-Photos env-var
  bug).

See [SPEC.md](SPEC.md) and [docs/CRYPTO-REVIEW.md](docs/CRYPTO-REVIEW.md) for the
frozen format and the cryptographic review dossier.

[Unreleased]: https://github.com/dlamarre-dev/StegoShard/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/dlamarre-dev/StegoShard/releases/tag/v0.9.0
