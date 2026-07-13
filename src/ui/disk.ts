/**
 * Disk destination flow (plan §6): the offline default, needing no network
 * permission. Save renders the vault's image set to PNG files — either as
 * individual downloads or bundled into one .zip; restore reads image files (or
 * a .zip) back and reconstructs the original file.
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
import { unzipSync, zipSync } from 'fflate';
import { downloadBlob, fileToImageData, imageWithLabelToPngBlob, type LabelBand } from './image-io';

export interface SaveOptions {
  keyMode: KeyMode;
  /** When set, a readable title band is drawn above each image. */
  label?: { title?: string; date?: string } | undefined;
  /** Bundle all images (+ .key) into a single .zip instead of many files. */
  asZip?: boolean;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode a file into a set of PNG images and download them (or a .zip). */
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
  const total = imagePayloads.length;

  const pngs: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < total; i++) {
    const img = codec.encode(imagePayloads[i]!, PROFILE_DISK);
    const band: LabelBand | undefined = options.label
      ? { ...options.label, index: i + 1, total }
      : undefined;
    const index = String(i + 1).padStart(2, '0');
    pngs.push({
      name: `imagevault-${setHex}-${index}.png`,
      bytes: await blobBytes(await imageWithLabelToPngBlob(img, band)),
    });
  }
  // Key block is external for keyfile/stego modes.
  const keyName = `imagevault-${setHex}.key`;
  const hasKeyFile = keyMode !== 'embedded';

  if (options.asZip) {
    const entries: Record<string, Uint8Array> = {};
    for (const p of pngs) entries[p.name] = p.bytes;
    if (hasKeyFile) entries[keyName] = keyBlock;
    const zipped = zipSync(entries, { level: 0 }); // PNGs are already compressed
    downloadBlob(new Blob([zipped as BufferSource]), `imagevault-${setHex}.zip`);
  } else {
    for (const p of pngs) {
      downloadBlob(new Blob([p.bytes as BufferSource], { type: 'image/png' }), p.name);
      await new Promise((r) => setTimeout(r, 150)); // avoid batch-blocking
    }
    if (hasKeyFile) downloadBlob(new Blob([keyBlock as BufferSource]), keyName);
  }

  return { imageCount: total, setId: setHex, keyMode };
}

const isZip = (name: string) => name.toLowerCase().endsWith('.zip');
const isKey = (name: string) => name.toLowerCase().endsWith('.key');

// Sizes to try when decoding an image. Rendered PNGs decode at the first (their
// natural size is already below the cap); photos of printed pages need to be
// downscaled from multiple megapixels before jsQR can locate the QR.
const DECODE_MAX_SIDES = [1400, 1000, 1800];

/** Decode one image's bytes to a payload, trying a few downscales. */
async function decodeImageBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  const codec = getCodec(CODEC_QR_GRID);
  const blob = new Blob([bytes as BufferSource]);
  for (const maxSide of DECODE_MAX_SIDES) {
    try {
      return codec.decode(await fileToImageData(blob, maxSide));
    } catch {
      // Try the next scale.
    }
  }
  return null;
}

/**
 * Reconstruct the original file from image files, a .zip of them, or a mix.
 * A `.key` file (loose or inside the zip) is used when present.
 */
export async function restoreFileFromDisk(
  files: File[],
  password: string,
  keyFile?: File,
): Promise<{ filename: string }> {
  const images: Uint8Array[] = [];
  let keyBlock: Uint8Array | undefined = keyFile ? await blobBytes(keyFile) : undefined;

  for (const file of files) {
    if (isZip(file.name)) {
      const entries = unzipSync(await blobBytes(file));
      for (const [name, bytes] of Object.entries(entries)) {
        if (isKey(name)) keyBlock = bytes;
        else if (/\.(png|jpe?g|webp)$/i.test(name)) images.push(bytes);
      }
    } else if (isKey(file.name)) {
      keyBlock = await blobBytes(file);
    } else {
      images.push(await blobBytes(file));
    }
  }

  const payloads: Uint8Array[] = [];
  for (const bytes of images) {
    const payload = await decodeImageBytes(bytes);
    // A single unreadable image is fine — erasure coding tolerates losses.
    if (payload) payloads.push(payload);
  }
  if (payloads.length === 0) throw new Error('restore: no readable images found');

  const { filename, content } = await importVault(payloads, password, { keyBlock });
  downloadBlob(new Blob([content as BufferSource]), filename);
  return { filename };
}
