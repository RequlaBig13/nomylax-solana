const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = 58n;

export function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let out = '';
  while (value > 0n) {
    const mod = Number(value % BASE);
    out = ALPHABET[mod] + out;
    value /= BASE;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out || '1';
}

export function decodeBase58(input: string): Uint8Array {
  if (!input) return new Uint8Array();
  let value = 0n;
  for (const char of input) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base58 character');
    value = value * BASE + BigInt(index);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  bytes.reverse();
  let leading = 0;
  for (const char of input) {
    if (char !== '1') break;
    leading++;
  }
  return Uint8Array.from([...new Array(leading).fill(0), ...bytes]);
}

export function isSolanaAddress(value: string): boolean {
  try {
    const bytes = decodeBase58(value);
    return bytes.length === 32;
  } catch {
    return false;
  }
}
