import { describe, it, expect } from 'vitest';
import { PROFILE_DISK } from '../header';
import { getCodec, qrGridCodec } from './index';

describe('QR-grid codec', () => {
  it('round-trips a payload through pixels (render → decode identity)', () => {
    const payload = Uint8Array.from({ length: 200 }, (_, i) => (i * 31 + 7) & 0xff);
    const img = qrGridCodec.encode(payload, PROFILE_DISK);
    expect(img.width).toBe(img.height);
    expect(img.data.length).toBe(img.width * img.height * 4);
    const decoded = qrGridCodec.decode(img);
    expect([...decoded]).toEqual([...payload]);
  });

  it('round-trips a payload that includes 0x00 bytes', () => {
    const payload = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 0 : i));
    const img = qrGridCodec.encode(payload, PROFILE_DISK);
    expect([...qrGridCodec.decode(img)]).toEqual([...payload]);
  });

  it('round-trips a large payload near the disk capacity (version-40 QR)', () => {
    const size = qrGridCodec.capacity(PROFILE_DISK) - 40; // just under the budget
    const payload = Uint8Array.from({ length: size }, (_, i) => (i * 97 + 13) & 0xff);
    const img = qrGridCodec.encode(payload, PROFILE_DISK);
    expect([...qrGridCodec.decode(img)]).toEqual([...payload]);
  });

  it('resolves the codec by header id', () => {
    expect(getCodec(qrGridCodec.id)).toBe(qrGridCodec);
    expect(() => getCodec(99)).toThrow(/unknown codec/);
  });
});
