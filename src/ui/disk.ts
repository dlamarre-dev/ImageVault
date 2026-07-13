/**
 * Disk destination flow (plan §6): the offline default, needing no network
 * permission. Save renders the vault's image set to PNG downloads; restore
 * reads image files back and reconstructs the original file.
 */

import {
  getCodec,
  exportVault,
  importVault,
  PROFILE_DISK,
  CODEC_QR_GRID,
  decodeHeader,
  toHex,
} from '@core';
import { downloadBlob, fileToImageData, imageDataToPngBlob } from './image-io';

/** Encode a file into a set of PNG images and download them. */
export async function saveFileToDisk(
  file: File,
  password: string,
): Promise<{ imageCount: number; setId: string }> {
  const content = new Uint8Array(await file.arrayBuffer());
  const { imagePayloads, setId } = await exportVault(file.name, content, password, {
    profile: PROFILE_DISK,
  });
  const codec = getCodec(decodeHeader(imagePayloads[0]!).codecId);
  const setHex = toHex(setId);

  for (let i = 0; i < imagePayloads.length; i++) {
    const img = codec.encode(imagePayloads[i]!, PROFILE_DISK);
    const blob = await imageDataToPngBlob(img);
    const index = String(i + 1).padStart(2, '0');
    downloadBlob(blob, `imagevault-${setHex}-${index}.png`);
    // Space out downloads so the browser does not batch-block them.
    await new Promise((r) => setTimeout(r, 150));
  }

  return { imageCount: imagePayloads.length, setId: setHex };
}

/** Reconstruct the original file from a set of image files and download it. */
export async function restoreFileFromDisk(
  files: File[],
  password: string,
): Promise<{ filename: string }> {
  const codec = getCodec(CODEC_QR_GRID);
  const payloads: Uint8Array[] = [];
  for (const file of files) {
    const img = await fileToImageData(file);
    try {
      payloads.push(codec.decode(img));
    } catch {
      // A single unreadable image is fine — erasure coding tolerates losses.
    }
  }
  if (payloads.length === 0) throw new Error('restore: no readable images found');

  const { filename, content } = await importVault(payloads, password);
  downloadBlob(new Blob([content as BufferSource]), filename);
  return { filename };
}
