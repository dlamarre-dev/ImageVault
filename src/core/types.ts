/**
 * Cross-cutting core types. These name the concepts the whole pipeline shares;
 * concrete implementations arrive in Phase 1 (see local plan / SPEC.md).
 */

/** Where an encoded image set is stored. Disk is the offline default. */
export type Destination = 'disk' | 'paper' | 'photos';

/**
 * How the wrapped DEK reaches a future restore. Chosen per save (see plan §4).
 * - embedded: the wrapped DEK travels inside the images (self-sufficient set).
 * - keyfile:  the wrapped DEK is archived separately as a .key file.
 * - stego:    the wrapped DEK is hidden in an ordinary-looking cover image.
 */
export type KeyMode = 'embedded' | 'keyfile' | 'stego';

/** Robustness profile, matched to the degradation channel of the destination. */
export type Profile = 'disk' | 'cloud' | 'paper';

/** Image codec family. QR-grid is the starting implementation (plan §1). */
export type CodecId = 'qr-grid' | 'dc-block';

/** Non-sensitive UI preferences persisted in storage.local. */
export interface Prefs {
  destination: Destination;
  keyMode: KeyMode;
}
