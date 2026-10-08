import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Ongeldige base32-tekens');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));

/** RFC 4226 HOTP (HMAC-SHA1). */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

export const stepAt = (time: number) => Math.floor(time / 1000 / STEP_SECONDS);

/** RFC 6238 TOTP voor de stap waarin `time` (ms) valt. */
export const totp = (secretBase32: string, time = Date.now(), digits = 6) =>
  hotp(base32Decode(secretBase32), stepAt(time), digits);

/**
 * Controleert een code in een venster van ±1 stap. Geeft de gematchte stap terug (om hergebruik
 * van dezelfde code te kunnen blokkeren) of null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  time = Date.now(),
  window = 1,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = stepAt(time);
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(hotp(secret, now + w));
    if (timingSafeEqual(expected, Buffer.from(code))) return now + w;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer = 'BiblioApp') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
