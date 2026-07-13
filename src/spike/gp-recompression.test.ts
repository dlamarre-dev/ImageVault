/**
 * Google Photos recompression spike (plan Phase 4 — "spike first").
 *
 * Google Photos re-encodes uploads as JPEG (luminance-preserving, 4:2:0 chroma,
 * downscaled if very large). Before building the upload/OAuth path we must
 * confirm the Cloud-profile QR survives that recompression. Here we simulate it
 * with a JPEG round-trip (jpeg-js) at Photos-like qualities and check the codec
 * still decodes.
 *
 * We also confirm the pessimistic assumption behind the stego "invisible" mode:
 * a classic LSB does NOT survive JPEG, so that mode is disk-only (plan §4).
 */

import { describe, it, expect } from 'vitest';
import jpeg from 'jpeg-js';
import { qrGridCodec } from '@core';
import { PROFILE_CLOUD } from '@core';
import type { ImageDataLike } from '@core';

/** JPEG round-trip approximating a Google Photos re-encode at a given quality. */
function recompress(img: ImageDataLike, quality: number): ImageDataLike {
  const encoded = jpeg.encode(
    { data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: img.width, height: img.height },
    quality,
  );
  const decoded = jpeg.decode(encoded.data, { useTArray: true });
  return {
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    width: decoded.width,
    height: decoded.height,
  };
}

const payload = Uint8Array.from({ length: 900 }, (_, i) => (i * 41 + 7) & 0xff);

describe('Google Photos recompression spike', () => {
  for (const quality of [92, 85, 75]) {
    it(`Cloud profile survives a JPEG round-trip at quality ${quality}`, () => {
      const img = qrGridCodec.encode(payload, PROFILE_CLOUD);
      const recompressed = recompress(img, quality);
      const decoded = qrGridCodec.decode(recompressed);
      expect([...decoded]).toEqual([...payload]);
    });
  }

  it('a classic LSB does not survive JPEG (invisible stego is disk-only)', () => {
    // A flat gray image with a bit pattern in the low bit of each pixel.
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    const bits: number[] = [];
    for (let p = 0; p < w * h; p++) {
      const bit = (p * 2654435761) & 1;
      bits.push(bit);
      const v = 128 | bit; // gray with LSB = bit
      data[p * 4] = v;
      data[p * 4 + 1] = v;
      data[p * 4 + 2] = v;
      data[p * 4 + 3] = 255;
    }
    const out = recompress({ data, width: w, height: h }, 85);
    let preserved = 0;
    for (let p = 0; p < w * h; p++) if ((out.data[p * 4]! & 1) === bits[p]) preserved++;
    const ratio = preserved / (w * h);
    // JPEG scrambles the low bit → ~chance level, nowhere near lossless.
    expect(ratio).toBeLessThan(0.9);
  });
});
