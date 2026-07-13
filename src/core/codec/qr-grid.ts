/**
 * QR-grid codec (plan §1): encodes an image payload as a standard QR symbol and
 * decodes it back. Standard QR gives us mature libraries, built-in Reed-Solomon
 * error correction inside each image, and proven print-scan behavior.
 *
 * Phase 1 renders one QR symbol per image (a 1×1 grid). The name leaves room to
 * tile several symbols per image later without changing the interface.
 *
 * The payload is carried in QR byte mode, and jsQR returns the exact bytes via
 * its `binaryData` field, so this is a faithful byte round-trip.
 */

import QRCode from 'qrcode';
import type { QRCodeSegment } from 'qrcode';
import jsQR from 'jsqr';
import { PROFILE_CLOUD, PROFILE_PAPER } from '../header';
import { CODEC_QR_GRID } from '../header';
import type { Codec, ImageDataLike } from './types';

const QUIET_ZONE = 4; // modules of white border, per the QR spec

/**
 * Robustness knobs per profile. Disk is lossless so it uses the lowest QR ECC
 * level (maximum data density); Cloud/Paper trade capacity for resilience.
 *
 * `maxPayload` is the usable total payload (header + shard) per image, kept a
 * little under the theoretical version-40 byte-mode maximum for each ECC level
 * (2953/2331/1663/1273 for L/M/Q/H) to leave headroom for mode overhead.
 */
function profileSettings(profile: number): {
  ecc: 'L' | 'M' | 'Q' | 'H';
  moduleScale: number;
  maxPayload: number;
} {
  switch (profile) {
    case PROFILE_PAPER:
      // Lower density than disk: fewer modules per QR (a lower version) means
      // larger printed modules, which survive a phone photo far better.
      return { ecc: 'H', moduleScale: 8, maxPayload: 800 };
    case PROFILE_CLOUD:
      return { ecc: 'Q', moduleScale: 8, maxPayload: 1600 };
    default: // PROFILE_DISK
      return { ecc: 'L', moduleScale: 6, maxPayload: 2800 };
  }
}

function capacity(profile: number): number {
  return profileSettings(profile).maxPayload;
}

function encode(payload: Uint8Array, profile: number): ImageDataLike {
  const { ecc, moduleScale } = profileSettings(profile);
  // Byte-mode segment carries the raw payload bytes verbatim.
  const segment = { data: payload, mode: 'byte' } as unknown as QRCodeSegment;
  const qr = QRCode.create([segment], { errorCorrectionLevel: ecc });

  const size = qr.modules.size;
  const modules = qr.modules.data;
  const dim = (size + QUIET_ZONE * 2) * moduleScale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255); // white RGBA

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules[row * size + col] !== 1) continue; // only paint dark modules
      const x0 = (col + QUIET_ZONE) * moduleScale;
      const y0 = (row + QUIET_ZONE) * moduleScale;
      for (let dy = 0; dy < moduleScale; dy++) {
        for (let dx = 0; dx < moduleScale; dx++) {
          const idx = ((y0 + dy) * dim + (x0 + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          // alpha stays 255
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

function decode(image: ImageDataLike): Uint8Array {
  const result = jsQR(image.data, image.width, image.height);
  if (!result) throw new Error('qr-grid: no QR code found in image');
  return Uint8Array.from(result.binaryData);
}

export const qrGridCodec: Codec = { id: CODEC_QR_GRID, capacity, encode, decode };
