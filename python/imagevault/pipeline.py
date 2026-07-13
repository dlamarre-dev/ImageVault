"""High-level restore: image payloads + password (+ optional key block) → file.

Mirrors src/core/vault.ts `importVault` and SPEC.md §1.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .crypto import decrypt_content, unwrap_dek
from .format import (
    decode_blob,
    parse_envelope,
    parse_key_block,
    parse_vault_blob,
    split_payload,
)


class MissingKeyError(Exception):
    """Raised when a keyfile/stego set is restored without its external key block."""


@dataclass
class RestoredFile:
    filename: str
    content: bytes


def decode_vault(
    payloads: list[bytes], password: str, key_block: bytes | None = None
) -> RestoredFile:
    if not payloads:
        raise ValueError("import: no images provided")

    decoded = [split_payload(p) for p in payloads]
    first = decoded[0][0]
    k, m, blob_len = first.k, first.m, first.blob_len

    slots: list[bytes | None] = [None] * (k + m)
    for header, shard in decoded:
        if header.set_id != first.set_id:
            continue
        if 0 <= header.shard_index < k + m:
            slots[header.shard_index] = shard

    blob = decode_blob(slots, k, m, blob_len)
    if hashlib.sha256(blob).digest()[:4] != first.hash:
        raise ValueError("import: reconstructed blob failed its integrity check")

    embedded_kb, iv, ciphertext = parse_vault_blob(blob)
    kb_bytes = embedded_kb if len(embedded_kb) > 0 else key_block
    if not kb_bytes:
        raise MissingKeyError("this image set needs a separate .key file to restore")

    dek = unwrap_dek(parse_key_block(kb_bytes), password)
    envelope = decrypt_content(dek, iv, ciphertext)
    filename, content = parse_envelope(envelope)
    return RestoredFile(filename, content)
