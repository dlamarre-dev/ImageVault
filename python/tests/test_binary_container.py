"""Unit tests for the binary container (SPEC §8) — mirrors the TS suite."""

from __future__ import annotations

import os
import sqlite3
import tempfile

import pytest

from stegoshard.binary_container import (
    BINARY_MAGIC,
    SQLITE_TEMPLATE,
    unwrap_binary,
    wrap_binary,
)


def test_branded_round_trip():
    wrapped = wrap_binary(b"\x01\x02\x03", "branded")
    assert wrapped[:4] == BINARY_MAGIC
    payload, variant = unwrap_binary(wrapped)
    assert variant == "branded"
    assert payload == b"\x01\x02\x03"


def test_disguised_has_sqlite_header():
    wrapped = wrap_binary(b"\x09\x08", "disguised")
    assert wrapped[:16] == b"SQLite format 3\x00"
    assert wrapped[16:18] == b"\x02\x00"  # page size 512
    assert wrapped[: len(SQLITE_TEMPLATE)] == SQLITE_TEMPLATE  # full DB prefix
    payload, variant = unwrap_binary(wrapped)
    assert variant == "disguised"
    assert payload == b"\x09\x08"


def test_disguised_opens_in_sqlite():
    """The disguised container is a real DB: sqlite3 opens it and lists the dummy
    rows, ignoring the ciphertext appended after the last page."""
    wrapped = wrap_binary(os.urandom(5000), "disguised")
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        with open(path, "wb") as f:
            f.write(wrapped)
        con = sqlite3.connect(path)
        assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        titles = [r[0] for r in con.execute("SELECT title FROM notes ORDER BY id")]
        con.close()
        assert titles == ["Groceries", "Todo", "Ideas"]
    finally:
        os.remove(path)


def test_neither_returns_none():
    assert unwrap_binary(b"\x00\x01\x02\x03\x04\x05") is None


def test_unsupported_version_raises():
    bad = bytearray(wrap_binary(b"\x01", "branded"))
    bad[4] = 99
    with pytest.raises(ValueError):
        unwrap_binary(bytes(bad))
