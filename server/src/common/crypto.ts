import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const V1_PREFIX = 'v1';
const HKDF_SALT = Buffer.from('manday-scorecard-v1', 'utf8');
const HKDF_INFO = Buffer.from('token-enc', 'utf8');

/** AES-256-GCM with HKDF-SHA256. Output: v1.base64url(iv).base64url(tag).base64url(cipher). */
export function encryptSecret(plain: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveHkdfKey(key), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [V1_PREFIX, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

/** Supports both v1 (HKDF) and legacy 3-part (SHA-256) ciphertexts, plus key rotation via `prevKeys`. */
export function decryptSecret(sealed: string, key: string, prevKeys: readonly string[] = []): string {
  const parts = sealed.split('.');
  const candidates = [key, ...prevKeys].filter((k) => k.length > 0);
  if (candidates.length === 0) {
    throw new Error('decryption key missing');
  }

  if (parts.length === 4 && parts[0] === V1_PREFIX) {
    const [, ivStr, tagStr, bodyStr] = parts;
    const iv = Buffer.from(ivStr ?? '', 'base64url');
    const tag = Buffer.from(tagStr ?? '', 'base64url');
    const body = Buffer.from(bodyStr ?? '', 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || body.length === 0) {
      throw new Error('sealed secret is malformed');
    }
    for (const k of candidates) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', deriveHkdfKey(k), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      } catch {
        // try next rotation key
      }
    }
    throw new Error('sealed secret decryption failed');
  }

  if (parts.length === 3) {
    const [ivStr, tagStr, bodyStr] = parts;
    const iv = Buffer.from(ivStr ?? '', 'base64url');
    const tag = Buffer.from(tagStr ?? '', 'base64url');
    const body = Buffer.from(bodyStr ?? '', 'base64url');
    if (iv.length === 0 || tag.length === 0 || body.length === 0) {
      throw new Error('sealed secret is malformed');
    }
    for (const k of candidates) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', deriveLegacyKey(k), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      } catch {
        // try next rotation key
      }
    }
    throw new Error('sealed secret decryption failed');
  }

  throw new Error('sealed secret is malformed');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison using SHA-256 digests to avoid length leaks. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}

function deriveHkdfKey(key: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(key, 'utf8'), HKDF_SALT, HKDF_INFO, 32));
}

function deriveLegacyKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}
