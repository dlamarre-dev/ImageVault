"""Binary format parsing — mirrors SPEC.md §3–§7 (all integers big-endian)."""

from __future__ import annotations

import gzip
import struct
from dataclasses import dataclass

from .reedsolomon import reconstruct_data

MAGIC = b"IVLT"
FORMAT_VERSION = 1
HEADER_LEN = 33

KEY_MAGIC = b"IVKY"
KEY_BLOCK_VERSION = 1

IV_LEN = 12
FLAG_COMPRESSED = 0x01


@dataclass
class Header:
    version: int
    set_id: bytes
    shard_index: int
    k: int
    m: int
    codec_id: int
    profile: int
    shard_len: int
    blob_len: int
    hash: bytes


def parse_header(payload: bytes) -> Header:
    if len(payload) < HEADER_LEN:
        raise ValueError("header: too short")
    if payload[0:4] != MAGIC:
        raise ValueError("header: bad magic")
    version = payload[4]
    if version != FORMAT_VERSION:
        raise ValueError(f"header: unsupported version {version}")
    set_id = payload[5:13]
    shard_index, k, m = struct.unpack(">HHH", payload[13:19])
    codec_id = payload[19]
    profile = payload[20]
    shard_len, blob_len = struct.unpack(">II", payload[21:29])
    hash_ = payload[29:33]
    return Header(version, set_id, shard_index, k, m, codec_id, profile, shard_len, blob_len, hash_)


def split_payload(payload: bytes) -> tuple[Header, bytes]:
    header = parse_header(payload)
    shard = payload[HEADER_LEN : HEADER_LEN + header.shard_len]
    if len(shard) != header.shard_len:
        raise ValueError("header: truncated shard")
    return header, shard


def decode_blob(shards: list[bytes | None], k: int, m: int, blob_len: int) -> bytes:
    data = reconstruct_data(shards, k, m)
    joined = b"".join(data)
    return joined[:blob_len]


@dataclass
class KeyBlock:
    salt: bytes
    iterations: int
    memory_kib: int
    parallelism: int
    iv: bytes
    wrapped: bytes


def parse_key_block(data: bytes) -> KeyBlock:
    if data[0:4] != KEY_MAGIC:
        raise ValueError("key block: bad magic")
    version = data[4]
    if version != KEY_BLOCK_VERSION:
        raise ValueError(f"key block: unsupported version {version}")
    iterations, memory_kib = struct.unpack(">II", data[5:13])
    parallelism = data[13]
    salt = data[14:30]
    iv = data[30:42]
    (wrapped_len,) = struct.unpack(">H", data[42:44])
    wrapped = data[44 : 44 + wrapped_len]
    if len(wrapped) != wrapped_len:
        raise ValueError("key block: truncated")
    return KeyBlock(salt, iterations, memory_kib, parallelism, iv, wrapped)


def parse_vault_blob(blob: bytes) -> tuple[bytes, bytes, bytes]:
    """Return (key_block_bytes, iv, ciphertext). key_block_bytes is empty when
    the key is external (keyfile/stego modes)."""
    (kb_len,) = struct.unpack(">H", blob[0:2])
    o = 2
    key_block = blob[o : o + kb_len]
    o += kb_len
    iv = blob[o : o + IV_LEN]
    o += IV_LEN
    ciphertext = blob[o:]
    return key_block, iv, ciphertext


def parse_envelope(envelope: bytes) -> tuple[str, bytes]:
    if len(envelope) < 3:
        raise ValueError("payload: too short")
    flags = envelope[0]
    (name_len,) = struct.unpack(">H", envelope[1:3])
    name_end = 3 + name_len
    filename = envelope[3:name_end].decode("utf-8")
    stored = envelope[name_end:]
    content = gzip.decompress(stored) if flags & FLAG_COMPRESSED else stored
    return filename, content
