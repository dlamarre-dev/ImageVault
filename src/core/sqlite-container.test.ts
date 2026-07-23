import { describe, it, expect } from 'vitest';
import { SQLITE_MAGIC, packSqlite, unpackSqlite } from './sqlite-container';

const PAGE_SIZE = 4096;

/** Sizes spanning inline-only, the local/overflow boundary, and multi-page chains. */
const SIZES = [1, 50, 4000, 4025, 4026, 4027, 5000, 8192, 50_000, 500_000];

describe('sqlite container pack/unpack', () => {
  for (const size of SIZES) {
    it(`round-trips a ${size}-byte blob through a valid database`, () => {
      const blob = Uint8Array.from({ length: size }, (_, i) => (i * 2654435761) & 0xff);
      const db = packSqlite(blob);

      // Real SQLite header and page size.
      expect([...db.slice(0, 16)]).toEqual([...SQLITE_MAGIC]);
      const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
      expect(dv.getUint16(16, false)).toBe(PAGE_SIZE);

      // Structurally exact: no unreferenced trailing bytes.
      const pageCount = dv.getUint32(28, false);
      expect(db.length).toBe(pageCount * PAGE_SIZE);
      // change counter (24) == version-valid-for (92), so SQLite trusts pageCount.
      expect(dv.getUint32(24, false)).toBe(dv.getUint32(92, false));

      const back = unpackSqlite(db);
      expect(back).not.toBeNull();
      expect([...back!]).toEqual([...blob]);
    });
  }

  it('returns null for bytes that are not one of our databases', () => {
    expect(unpackSqlite(Uint8Array.from([1, 2, 3]))).toBeNull(); // too short
    const notSqlite = new Uint8Array(PAGE_SIZE);
    expect(unpackSqlite(notSqlite)).toBeNull(); // no SQLite magic
  });
});

describe('sqlite container reader robustness (multi-row)', () => {
  it('spreads a large blob across several page_cache rows and still round-trips', () => {
    const blob = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 97) & 0xff);
    const db = packSqlite(blob);
    // Page 2 must be an interior b-tree root (0x05) once there are many rows.
    expect(db[PAGE_SIZE]).toBe(0x05);
    expect([...unpackSqlite(db)!]).toEqual([...blob]);
  });

  it('returns null when the root b-tree page type is neither interior nor leaf', () => {
    const db = packSqlite(Uint8Array.of(1, 2, 3, 4));
    db[PAGE_SIZE] = 0x99; // corrupt the cache root page type
    expect(unpackSqlite(db)).toBeNull();
  });
});
