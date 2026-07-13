/**
 * Codec abstraction: turns an image payload (header || shard bytes) into pixels
 * and back. Implementations are hidden behind this interface so the pipeline is
 * agnostic to the concrete image encoding (plan §1).
 */

/** A minimal, environment-neutral stand-in for the DOM ImageData. */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Codec {
  /** Matches the CODEC_ID stored in the image header. */
  readonly id: number;
  /** Max total payload bytes (header + shard) that fit one image at this profile. */
  capacity(profile: number): number;
  encode(payload: Uint8Array, profile: number): ImageDataLike;
  decode(image: ImageDataLike): Uint8Array;
}
