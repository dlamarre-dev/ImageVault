"""Non-image binary container (SPEC §8) — mirrors src/core/binary-container.ts.

Two variants wrap an already-encrypted vault blob (or a key block) in a single
file: a self-labelling 'branded' blob, or a 'disguised' one that prepends a real,
complete SQLite database (a `notes` table with dummy rows) with the payload
appended after the DB's last page — so it opens cleanly in sqlite3.
"""

from __future__ import annotations

import base64

BINARY_MAGIC = b"SSBN"  # StegoShard BiNary container
BINARY_VERSION = 1

# A complete, valid SQLite 3 database (1024 bytes, two 512-byte pages) with a
# `notes` table of innocuous dummy rows. Must byte-match src/core/binary-container.ts.
# The payload is appended after page 2; SQLite trusts the header's page count
# (offset 28 == real count, change-counter 24 == version-valid-for 96) and ignores
# the trailing bytes, so the file opens and lists the dummy rows. Frozen constant.
SQLITE_TEMPLATE = base64.b64decode(
    "U1FMaXRlIGZvcm1hdCAzAAIAAQEAQCAgAAAAAwAAAAIAAAAAAAAAAAAAAAIAAAAEAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAC6GKQ0AAAABAaUAAaUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFkBBxcXFwGBEXRhYmxlbm90ZXNub3RlcwJDUkVBVEUgVEFCTEUgbm90ZXMgKGlkIElOVEVHRVIgUFJJTUFSWSBLRVksIHRpdGxlIFRFWFQsIGJvZHkgVEVYVCkNAAAAAwGAAAHYAaoBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAwQAF0tJZGVhc3dlZWtlbmQgaGlrZTsgcmVwYWludCB0aGUgZmVuY2UsAgQAFVVUb2RvY2FsbCB0aGUgcGx1bWJlcjsgcmVuZXcgbGlicmFyeSBjYXJkJgEEAB8/R3JvY2VyaWVzbWlsaywgZWdncywgYnJlYWQsIGNvZmZlZQ=="
)
SQLITE_DETECT = SQLITE_TEMPLATE[:100]  # distinguishing head (fits a 128-byte peek)


def wrap_binary(payload: bytes, variant: str) -> bytes:
    if variant == "branded":
        return BINARY_MAGIC + bytes([BINARY_VERSION]) + payload
    if variant == "disguised":
        return SQLITE_TEMPLATE + payload
    raise ValueError(f"unknown binary variant: {variant}")


def unwrap_binary(data: bytes) -> tuple[bytes, str] | None:
    """Strip a container to (payload, variant), or None if it is neither."""
    if data[: len(BINARY_MAGIC)] == BINARY_MAGIC:
        if len(data) <= len(BINARY_MAGIC):
            raise ValueError("binary container: truncated (no version byte)")
        version = data[len(BINARY_MAGIC)]
        if version != BINARY_VERSION:
            raise ValueError(f"binary container: unsupported version {version}")
        return data[len(BINARY_MAGIC) + 1 :], "branded"
    # Detect on the DB header; strip the whole template (payload sits after page 2).
    if data[: len(SQLITE_DETECT)] == SQLITE_DETECT:
        return data[len(SQLITE_TEMPLATE) :], "disguised"
    return None
