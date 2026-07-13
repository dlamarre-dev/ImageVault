import { CODEC_QR_GRID } from '../header';
import type { Codec } from './types';
import { qrGridCodec } from './qr-grid';

export * from './types';
export { qrGridCodec } from './qr-grid';

/** Resolve a codec by its CODEC_ID (as stored in the image header). */
export function getCodec(id: number): Codec {
  switch (id) {
    case CODEC_QR_GRID:
      return qrGridCodec;
    default:
      throw new Error(`unknown codec id ${id}`);
  }
}
