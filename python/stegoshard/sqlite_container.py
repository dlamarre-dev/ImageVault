"""Deniable SQLite container (SPEC §8) — mirrors src/core/sqlite-container.ts.

The vault blob is stored inside a genuine, minimal SQLite 3 database as the BLOB
value of one row of a `cache(k TEXT, v BLOB)` table (spilling into a proper
overflow-page chain), so the file is byte-for-byte valid: page_count × page_size
== file size, integrity_check is ok, and it opens in sqlite3. No trailing bytes.

This is a minimal implementation of just the slice of the SQLite file format we
emit and read back, byte-compatible with the TypeScript writer.
"""

from __future__ import annotations

import struct

PAGE_SIZE = 4096
U = PAGE_SIZE  # usable size (reserved bytes per page = 0)
SQLITE_MAGIC = b"SQLite format 3\x00"
SQLITE_VERSION_NUMBER = 3045000
CACHE_ROOT_PAGE = 2
CREATE_SQL = b"CREATE TABLE cache(k TEXT, v BLOB)"
VAULT_KEY = b"page_cache"

MAX_LOCAL = U - 35
MIN_LOCAL = (U - 12) * 32 // 255 - 23
OVERFLOW_CHUNK = U - 4


def _put_varint(n: int) -> bytes:
    if n < 0:
        raise ValueError("sqlite: bad varint")
    groups = []
    v = n
    while True:
        groups.insert(0, v & 0x7F)
        v >>= 7
        if v == 0:
            break
    for i in range(len(groups) - 1):
        groups[i] |= 0x80
    return bytes(groups)


def _read_varint(buf: bytes, off: int) -> tuple[int, int]:
    result = 0
    for i in range(9):
        byte = buf[off + i]
        if i == 8:
            return result * 256 + byte, 9
        result = result * 128 + (byte & 0x7F)
        if (byte & 0x80) == 0:
            return result, i + 1
    return result, 9


def _encode_record(cols: list[tuple[str, object]]) -> bytes:
    """cols: list of ("text"|"blob", bytes) or ("int", int)."""
    serials = bytearray()
    bodies = bytearray()
    for kind, val in cols:
        if kind == "text":
            serials += _put_varint(2 * len(val) + 13)  # type: ignore[arg-type]
            bodies += val  # type: ignore[operator]
        elif kind == "blob":
            serials += _put_varint(2 * len(val) + 12)  # type: ignore[arg-type]
            bodies += val  # type: ignore[operator]
        else:  # small non-negative int → serial type 1 (1-byte)
            serials += _put_varint(1)
            bodies += bytes([val & 0xFF])  # type: ignore[operator]
    header_len_size = 1
    while True:
        header_len = header_len_size + len(serials)
        enc = _put_varint(header_len)
        if len(enc) == header_len_size:
            return enc + bytes(serials) + bytes(bodies)
        header_len_size = len(enc)


def _split_payload(payload_len: int) -> int:
    if payload_len <= MAX_LOCAL:
        return payload_len
    k = MIN_LOCAL + (payload_len - MIN_LOCAL) % OVERFLOW_CHUNK
    return k if k <= MAX_LOCAL else MIN_LOCAL


def _build_leaf_page(cells: list[bytes], header_offset: int) -> bytearray:
    page = bytearray(PAGE_SIZE)
    content = PAGE_SIZE
    ptrs = []
    for cell in cells:
        content -= len(cell)
        page[content : content + len(cell)] = cell
        ptrs.append(content)
    h = header_offset
    page[h] = 0x0D  # leaf table b-tree
    struct.pack_into(">H", page, h + 3, len(cells))
    struct.pack_into(">H", page, h + 5, content)
    po = h + 8
    for p in ptrs:
        struct.pack_into(">H", page, po, p)
        po += 2
    return page


def _write_header(page: bytearray, page_count: int) -> None:
    page[0 : len(SQLITE_MAGIC)] = SQLITE_MAGIC
    struct.pack_into(">H", page, 16, PAGE_SIZE)
    page[18] = 1
    page[19] = 1
    page[20] = 0
    page[21] = 64
    page[22] = 32
    page[23] = 32
    struct.pack_into(">I", page, 24, 1)  # file change counter
    struct.pack_into(">I", page, 28, page_count)
    struct.pack_into(">I", page, 40, 1)  # schema cookie
    struct.pack_into(">I", page, 44, 4)  # schema format
    struct.pack_into(">I", page, 56, 1)  # UTF-8
    struct.pack_into(">I", page, 92, 1)  # version-valid-for
    struct.pack_into(">I", page, 96, SQLITE_VERSION_NUMBER)


def _decoy_cell(rowid: int, key: bytes, value: bytes) -> bytes:
    record = _encode_record([("text", key), ("blob", value)])
    return _put_varint(len(record)) + _put_varint(rowid) + record


def pack_sqlite(blob: bytes) -> bytes:
    decoys = [(b"schema_version", b"\x32"), (b"last_sync", b"1700000000")]

    vault_record = _encode_record([("text", VAULT_KEY), ("blob", blob)])
    P = len(vault_record)
    local = _split_payload(P)
    overflow_bytes = P - local
    overflow_pages = (overflow_bytes + OVERFLOW_CHUNK - 1) // OVERFLOW_CHUNK if overflow_bytes else 0
    page_count = 2 + overflow_pages
    first_overflow = 3 if overflow_pages else 0

    vault_cell = bytearray()
    vault_cell += _put_varint(P)
    vault_cell += _put_varint(3)
    vault_cell += vault_record[:local]
    if overflow_pages:
        vault_cell += struct.pack(">I", first_overflow)

    schema_record = _encode_record(
        [
            ("text", b"table"),
            ("text", b"cache"),
            ("text", b"cache"),
            ("int", CACHE_ROOT_PAGE),
            ("text", CREATE_SQL),
        ]
    )
    schema_cell = _put_varint(len(schema_record)) + _put_varint(1) + schema_record
    page1 = _build_leaf_page([schema_cell], 100)
    _write_header(page1, page_count)

    used = 8 + (len(vault_cell) + 2)
    included = []
    for key, value in decoys:
        cell = _decoy_cell(len(included) + 1, key, value)
        if used + len(cell) + 2 <= PAGE_SIZE:
            included.append(cell)
            used += len(cell) + 2
    page2 = _build_leaf_page(included + [bytes(vault_cell)], 0)

    pages = [page1, page2]
    o = local
    for i in range(overflow_pages):
        page = bytearray(PAGE_SIZE)
        chunk = vault_record[o : o + OVERFLOW_CHUNK]
        nxt = 0 if i == overflow_pages - 1 else 3 + i + 1
        struct.pack_into(">I", page, 0, nxt)
        page[4 : 4 + len(chunk)] = chunk
        pages.append(page)
        o += OVERFLOW_CHUNK

    return b"".join(bytes(p) for p in pages)


def _decode_row(payload: bytes) -> tuple[bytes, bytes] | None:
    header_len, hl_size = _read_varint(payload, 0)
    p = hl_size
    serials = []
    while p < header_len:
        st, n = _read_varint(payload, p)
        serials.append(st)
        p += n
    if len(serials) < 2:
        return None
    cols = []
    for st in serials[:2]:
        if st >= 13 and st % 2 == 1:
            length = (st - 13) // 2
        elif st >= 12 and st % 2 == 0:
            length = (st - 12) // 2
        else:
            length = 0
        cols.append(payload[p : p + length])
        p += length
    return cols[0], cols[1]


def unpack_sqlite(data: bytes) -> bytes | None:
    """Extract the vault blob from a disguised SQLite database, or None."""
    if len(data) < PAGE_SIZE or data[: len(SQLITE_MAGIC)] != SQLITE_MAGIC:
        return None
    (page_size,) = struct.unpack_from(">H", data, 16)
    if page_size != PAGE_SIZE:
        return None
    (page_count,) = struct.unpack_from(">I", data, 28)
    if len(data) < page_count * PAGE_SIZE:
        return None

    def page_at(n: int) -> bytes:
        return data[(n - 1) * PAGE_SIZE : n * PAGE_SIZE]

    def reassemble(page: bytes, cell_off: int) -> bytes | None:
        p = cell_off
        P, n1 = _read_varint(page, p)
        p += n1
        _, n2 = _read_varint(page, p)  # rowid
        p += n2
        local = _split_payload(P)
        out = bytearray(page[p : p + local])
        filled = local
        if P > local:
            (nxt,) = struct.unpack_from(">I", page, p + local)
            while nxt != 0 and filled < P:
                if nxt > page_count:
                    return None
                op = page_at(nxt)
                (following,) = struct.unpack_from(">I", op, 0)
                take = min(OVERFLOW_CHUNK, P - filled)
                out += op[4 : 4 + take]
                filled += take
                nxt = following
        return bytes(out) if filled == P else None

    cache = page_at(CACHE_ROOT_PAGE)
    if cache[0] != 0x0D:
        return None
    (n_cells,) = struct.unpack_from(">H", cache, 3)
    for i in range(n_cells):
        (cell_off,) = struct.unpack_from(">H", cache, 8 + i * 2)
        payload = reassemble(cache, cell_off)
        if payload is None:
            continue
        row = _decode_row(payload)
        if row and row[0] == VAULT_KEY:
            return row[1] if len(row[1]) > 0 else None
    return None
