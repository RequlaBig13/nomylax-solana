import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error('SESSION_SECRET is required to encrypt connector credentials');
  return createHash('sha256').update(`nomylax:connector:${secret}`).digest();
}

export function encryptConnectorSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptConnectorSecret(value: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = value.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !cipherRaw) throw new Error('Connector credential is malformed');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
