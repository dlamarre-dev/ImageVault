/**
 * Minimal i18n for the web app — reuses the extension's message catalogs
 * (bundled at build time) with a chrome.i18n-style getMessage. Picks the locale
 * from the browser, falling back to English for any missing key.
 */

import en from '../../public/_locales/en/messages.json';
import fr from '../../public/_locales/fr/messages.json';
import {
  FileTooLargeError,
  MissingKeyError,
  TooManyImagesError,
  WrongPasswordError,
} from '@core';

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}
type Catalog = Record<string, Entry>;

const lang = (navigator.language || 'en').toLowerCase();
const chosen: Catalog = lang.startsWith('fr') ? (fr as Catalog) : (en as Catalog);
const MESSAGES: Catalog = { ...(en as Catalog), ...chosen };

export function msg(key: string, subs?: string | string[]): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  const args = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
  let text = entry.message;
  if (entry.placeholders) {
    for (const [name, ph] of Object.entries(entry.placeholders)) {
      const idx = Number(String(ph.content).replace('$', '')) - 1;
      text = text.split(`$${name.toUpperCase()}$`).join(args[idx] ?? '');
    }
  }
  return text;
}

export function localizeDom(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = msg(key);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = msg(key);
  }
}

export function friendlyError(err: unknown): string {
  if (err instanceof WrongPasswordError) return msg('errWrongPassword');
  if (err instanceof MissingKeyError) return msg('errMissingKey');
  if (err instanceof FileTooLargeError) {
    return msg('errFileTooLarge', [
      String(Math.ceil(err.size / 1024)),
      String(Math.floor(err.limit / 1024)),
    ]);
  }
  if (err instanceof TooManyImagesError) {
    return msg('errTooManyImages', [String(err.count), String(err.limit)]);
  }
  return err instanceof Error ? err.message : String(err);
}
