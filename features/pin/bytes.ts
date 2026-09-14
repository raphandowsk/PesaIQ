/**
 * Base64 for keys and points, written out so it behaves the same on Hermes,
 * the web and Node (Buffer does not exist on phones).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const n = (bytes[i] << 16) | ((hasB ? bytes[i + 1] : 0) << 8) | (hasC ? bytes[i + 2] : 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += hasB ? ALPHABET[(n >> 6) & 63] : '=';
    out += hasC ? ALPHABET[n & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) throw new Error('Not base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buffer = ((buffer << 6) | (LOOKUP.get(ch) ?? 0)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}
