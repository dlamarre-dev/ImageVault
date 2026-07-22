/**
 * Password entropy helpers (A2, UX only — no format impact).
 *
 * `passwordStrength` gives a deliberately conservative *estimate* of a typed
 * password's strength to nudge users away from weak secrets — Argon2id only
 * multiplies the cost of a guessing attack, so the password's own entropy is the
 * real ceiling on confidentiality. `generatePassphrase` produces a high-entropy
 * secret from the platform CSPRNG for users who would rather not invent one.
 *
 * Nothing here changes the vault format; the generated string is just typed into
 * the normal password field.
 */

/**
 * Crockford base32 alphabet (no I/L/O/U to avoid visual/keyboard confusion).
 * Exactly 32 symbols ⇒ 5 bits of entropy per character with no modulo bias
 * (256 / 32 = 8, so `byte & 31` is uniform).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS = 4;
const GROUP_LEN = 5;

/** Entropy of a passphrase produced by `generatePassphrase`, in bits. */
export const GENERATED_PASSPHRASE_BITS = GROUPS * GROUP_LEN * 5; // 100

/**
 * A fresh ~100-bit passphrase like `A7F3K-9QW2M-XR4TP-H8NZ6`, drawn from the
 * platform CSPRNG. Language-neutral (works for every locale) and its entropy is
 * exact and auditable, unlike a word list.
 */
export function generatePassphrase(): string {
  const n = GROUPS * GROUP_LEN;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (let i = 0; i < n; i++) {
    out += ALPHABET[bytes[i]! & 31];
    if ((i + 1) % GROUP_LEN === 0 && i + 1 < n) out += '-';
  }
  bytes.fill(0);
  return out;
}

export interface PasswordStrength {
  /** Conservative estimated entropy in bits. */
  bits: number;
  /** Bucketed 0 (very weak) … 4 (strong), for a UI meter. */
  score: 0 | 1 | 2 | 3 | 4;
}

/**
 * Estimate password strength from character-class diversity and length, damped
 * by the ratio of distinct characters so that runs like `aaaaaaaa` don't score
 * as if every character were independent. This is a heuristic lower bound, not a
 * dictionary/pattern analysis — the UI presents it as an estimate.
 */
export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) return { bits: 0, score: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33; // rough printable-symbol set
  const uniqueRatio = new Set(pw).size / pw.length;
  const rawBits = pw.length * Math.log2(pool || 2);
  const bits = Math.round(rawBits * Math.min(1, 0.3 + 0.7 * uniqueRatio));
  const score = bits < 40 ? 0 : bits < 60 ? 1 : bits < 80 ? 2 : bits < 100 ? 3 : 4;
  return { bits, score: score as PasswordStrength['score'] };
}
