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
  type KeyMode,
  type VaultKey,
} from '@core';
import { downloadBlob, fileToImageData, imageWithLabelToPngBlob, type LabelBand } from './image-io';

export interface SaveOptions {
  keyMode: KeyMode;
  /** When set, a readable title band is drawn above each image. */
  label?: { title?: string; date?: string } | undefined;
}

/** Encode a file into a set of PNG images and download them. */
export async function saveFileToDisk(
  file: File,
  key: VaultKey,
  options: SaveOptions,
): Promise<{ imageCount: number; setId: string; keyMode: KeyMode }> {
  const content = new Uint8Array(await file.arrayBuffer());
  const { imagePayloads, setId, keyBlock, keyMode } = await exportVault(file.name, content, key, {
    profile: PROFILE_DISK,
    keyMode: options.keyMode,
  });
  const codec = getCodec(decodeHeader(imagePayloads[0]!).codecId);
  const setHex = toHex(setId);

  for (let i = 0; i < imagePayloads.length; i++) {
    const img = codec.encode(imagePayloads[i]!, PROFILE_DISK);
    const band: LabelBand | undefined = options.label
      ? { ...options.label, index: i + 1, total: imagePayloads.length }
      : undefined;
    const blob = await imageWithLabelToPngBlob(img, band);
    const index = String(i + 1).padStart(2, '0');
    downloadBlob(blob, `imagevault-${setHex}-${index}.png`);
    // Space out downloads so the browser does not batch-block them.
    await new Promise((r) => setTimeout(r, 150));
  }

  // For keyfile/stego modes the key block is not in the images — save it too.
  if (keyMode !== 'embedded') {
    downloadBlob(new Blob([keyBlock as BufferSource]), `imagevault-${setHex}.key`);
  }

  return { imageCount: imagePayloads.length, setId: setHex, keyMode };
}

/**
 * Reconstruct the original file from a set of image files and download it.
 * `keyFile` is required for image sets saved in keyfile/stego mode.
 */
export async function restoreFileFromDisk(
  files: File[],
  password: string,
  keyFile?: File,
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

  const keyBlock = keyFile ? new Uint8Array(await keyFile.arrayBuffer()) : undefined;
  const { filename, content } = await importVault(payloads, password, { keyBlock });
  downloadBlob(new Blob([content as BufferSource]), filename);
  return { filename };
}
