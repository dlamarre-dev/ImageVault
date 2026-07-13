/**
 * Managed vault key, persisted in the browser (plan §4).
 *
 * At rest, `chrome.storage.local` holds only the *wrapped* DEK block (salt,
 * Argon2id params, IV, wrapped DEK) — useless without the password. Unlocking
 * derives the KEK from the password and keeps the DEK in memory for the current
 * popup session only; it is never persisted and is dropped when the popup
 * closes (the session model chosen for Phase 2).
 */

import browser from 'webextension-polyfill';
import {
  createKeyBlock,
  fromBase64,
  parseKeyBlock,
  rewrapKeyBlock,
  serializeKeyBlock,
  toBase64,
  unlockKeyBlock,
  type VaultKey,
} from '@core';

const STORAGE_KEY = 'imagevault.keyBlock';

// The unlocked key for this popup session. Never written to storage.
let session: VaultKey | null = null;

async function readStoredBlock(): Promise<Uint8Array | null> {
  const record = await browser.storage.local.get(STORAGE_KEY);
  const value = record[STORAGE_KEY];
  return typeof value === 'string' ? fromBase64(value) : null;
}

async function writeStoredBlock(keyBlock: Uint8Array): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: toBase64(keyBlock) });
}

/** Whether a vault key has been set up on this device. */
export async function isKeySet(): Promise<boolean> {
  return (await readStoredBlock()) !== null;
}

/** The unlocked key for this session, or null if locked. */
export function currentSession(): VaultKey | null {
  return session;
}

/** The unlocked key, or throw — for flows that require an unlocked vault. */
export function requireSession(): VaultKey {
  if (!session) throw new Error('vault is locked — unlock with your password first');
  return session;
}

/** Drop the in-memory session key. */
export function lock(): void {
  session = null;
}

/**
 * Create a brand-new vault key protected by `password`. Refuses to clobber an
 * existing key unless `overwrite` is set.
 */
export async function setupKey(password: string, overwrite = false): Promise<void> {
  if (!overwrite && (await isKeySet())) {
    throw new Error('a vault key already exists on this device');
  }
  const { dek, block } = await createKeyBlock(password);
  const keyBlock = serializeKeyBlock(block);
  await writeStoredBlock(keyBlock);
  session = { dek, keyBlock };
}

/** Unlock the stored key with `password`, caching it for this session. */
export async function unlock(password: string): Promise<VaultKey> {
  const keyBlock = await readStoredBlock();
  if (!keyBlock) throw new Error('no vault key on this device — set one up first');
  const dek = await unlockKeyBlock(parseKeyBlock(keyBlock), password); // throws WrongPasswordError
  session = { dek, keyBlock };
  return session;
}

/** Change the password by re-wrapping the same DEK (existing vaults stay valid). */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const stored = await readStoredBlock();
  if (!stored) throw new Error('no vault key on this device');
  const newBlock = await rewrapKeyBlock(parseKeyBlock(stored), oldPassword, newPassword);
  const keyBlock = serializeKeyBlock(newBlock);
  await writeStoredBlock(keyBlock);
  if (session) session = { ...session, keyBlock };
}

/** The serialized key block, for saving as a `.key` file (transfer/backup). */
export async function exportKeyBlock(): Promise<Uint8Array> {
  const keyBlock = await readStoredBlock();
  if (!keyBlock) throw new Error('no vault key on this device');
  return keyBlock;
}

/** Import a key block from a `.key` file, verifying the password before storing. */
export async function importKeyBlock(keyBlock: Uint8Array, password: string): Promise<void> {
  const dek = await unlockKeyBlock(parseKeyBlock(keyBlock), password); // validates password
  await writeStoredBlock(keyBlock);
  session = { dek, keyBlock };
}

/** Permanently remove the vault key from this device (irreversible). */
export async function eraseKey(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
  lock();
}
