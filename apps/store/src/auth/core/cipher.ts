import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** The value names a key that is not in this ring (rotation in progress), not a modified value. */
export class UnknownEncryptionKeyError extends Error {
  constructor() {
    super('Unknown session encryption key');
    this.name = 'UnknownEncryptionKeyError';
  }
}

/** One key of the ring: `kid` names it in every value it encrypted. */
export interface EncryptionKey {
  kid: string;
  /** 32 bytes (AES-256). */
  key: Buffer;
}

export interface TokenCipher {
  /** `aad` binds the value to its place (store key and field), so values cannot be swapped. */
  encrypt(plaintext: string, aad: string): string;
  /** Throws `UnknownEncryptionKeyError` for a key outside the ring, another error for a modified value or another `aad`. */
  decrypt(value: string, aad: string): string;
}

const IV_BYTES = 12;
/** Format of a key id (`STORE_SESSION_ENC_KEYS`). */
const KID = /^[A-Za-z0-9_-]{1,16}$/;
const TAG_BYTES = 16;

/**
 * AES-256-GCM for the tokens kept in the session store. The first key encrypts; every key
 * of the ring decrypts, so a key is rotated by putting a new one first and removing the
 * old one after the longest session (12 h). Format: `kid:base64url(iv | ciphertext | tag)`.
 */
export function createTokenCipher(ring: readonly EncryptionKey[]): TokenCipher {
  const active = ring[0];
  if (active === undefined) throw new Error('At least one session encryption key is required');
  const byKid = new Map(ring.map((entry) => [entry.kid, entry.key]));

  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', active.key, iv);
      cipher.setAAD(Buffer.from(aad, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return `${active.kid}:${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url')}`;
    },
    decrypt(value, aad) {
      const separator = value.indexOf(':');
      const kid = separator > 0 ? value.slice(0, separator) : '';
      // No prefix or a malformed kid: a corrupted value, not one of a key outside the ring.
      if (!KID.test(kid)) throw new Error('Malformed encrypted value');
      const key = byKid.get(kid);
      if (key === undefined) throw new UnknownEncryptionKeyError();
      const data = Buffer.from(value.slice(separator + 1), 'base64url');
      if (data.length < IV_BYTES + TAG_BYTES) throw new Error('Malformed encrypted value');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
      return Buffer.concat([decipher.update(data.subarray(IV_BYTES, data.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    },
  };
}

/**
 * Parses `STORE_SESSION_ENC_KEYS`: comma-separated `kid:base64` entries, each a 32-byte key,
 * the first one active. Errors never contain key material.
 */
export function parseEncryptionKeys(value: string): EncryptionKey[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) throw new Error('STORE_SESSION_ENC_KEYS has no keys');

  const ring = entries.map((entry, index) => {
    const separator = entry.indexOf(':');
    const kid = separator > 0 ? entry.slice(0, separator) : '';
    if (!KID.test(kid)) {
      throw new Error(`STORE_SESSION_ENC_KEYS entry ${String(index + 1)} is not kid:base64 (kid: 1-16 of A-Z a-z 0-9 _ -)`);
    }
    const encoded = entry.slice(separator + 1);
    const key = Buffer.from(encoded, 'base64');
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded) || key.length !== 32) {
      throw new Error(`STORE_SESSION_ENC_KEYS key "${kid}" is not 32 bytes in base64`);
    }
    return { kid, key };
  });
  if (new Set(ring.map((entry) => entry.kid)).size !== ring.length) throw new Error('STORE_SESSION_ENC_KEYS has duplicate kids');

  return ring;
}
