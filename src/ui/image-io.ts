/**
 * Browser-side image I/O adapters for the disk destination. These bridge the
 * codec's environment-neutral ImageDataLike to real PNG files, using
 * OffscreenCanvas. The disk profile is lossless (PNG), so this bridge does not
 * degrade the encoded bytes.
 */

import type { ImageDataLike } from '@core';

/** Render an ImageDataLike to a lossless PNG blob. */
export async function imageDataToPngBlob(img: ImageDataLike): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image-io: 2D canvas context unavailable');
  // Copy into an ArrayBuffer-backed array (ImageData's constructor requires it).
  const pixels = new Uint8ClampedArray(img.data);
  ctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Decode an image file (PNG/JPEG/…) into pixels for the codec to read. */
export async function fileToImageData(file: Blob): Promise<ImageDataLike> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image-io: 2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: data.data, width: data.width, height: data.height };
  } finally {
    bitmap.close();
  }
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
