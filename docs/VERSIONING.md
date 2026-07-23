# Versioning

StegoShard has **two independent version lines**. Don't conflate them.

## 1. Application / CLI version (SemVer)

`package.json`'s `version` (and the extension manifest) follow
[Semantic Versioning](https://semver.org/). This tracks the *software* — UI, CLI,
build — and is what [CHANGELOG.md](../CHANGELOG.md) records. Pre-1.0 (`0.x`), minor
bumps may include behavioural changes; there is no stability promise until 1.0.

## 2. On-disk format version (the real compatibility contract)

The bytes StegoShard writes are a **stable, versioned public interface** so a
vault can be recovered without this software (see [SPEC.md](../SPEC.md), frozen at
format v1). The format carries several independent version tags:

| Constant            | Where                         | Meaning                                   |
| ------------------- | ----------------------------- | ----------------------------------------- |
| `FORMAT_VERSION`    | `src/core/header.ts`          | Per-image header / overall on-image format |
| `KEY_BLOCK_VERSION` | `src/core/crypto.ts`          | Serialized wrapped-DEK key block (§5.1)   |
| `BINARY_VERSION`    | `src/core/binary-container.ts`| Branded binary container (§8)             |
| `CODEC_GALLERY`     | `src/core/header.ts`          | Gallery Mode codec id (§9)                 |

All are `1` today.

### Rules for a format change

A change is **breaking** if an existing artifact would no longer decode, or a new
artifact would not decode on an older reader. Breaking changes MUST:

1. Bump the relevant version constant (and add a new branch to the decoders,
   keeping the old one until support is formally dropped).
2. Update [SPEC.md](../SPEC.md) — including the §10 constants table — and
   [docs/CRYPTO-REVIEW.md](../CRYPTO-REVIEW.md) where crypto is affected.
3. Update the **Python reference decoder** (`python/stegoshard/`) in the same
   change, and regenerate the frozen vectors (`npm run vectors`) and conformance
   fixtures (`npm run fixtures`). CI's cross-implementation conformance job must
   stay green.

Non-breaking, purely internal repackaging (that still decodes byte-for-byte on the
current reader) does **not** bump a format constant. Example: 0.9.0 rearranged the
*disguised SQLite container's* internal rows but the vault blob and container
detection were unchanged, so no version bump — only the SemVer app version moved.

See also the "Format stability" section of [CONTRIBUTING.md](../CONTRIBUTING.md).
