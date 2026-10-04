import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { buildChallenge, consumeNonce, issueNonce, resetNonces, verifyChallenge } from '@/server/auth/siws';
import { encodeBase58 } from '@/lib/base58';

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return { address: encodeBase58(raw), privateKey };
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'n'.repeat(64);
  resetNonces();
});

describe('Sign In With Solana challenge', () => {
  it('verifies a signature from the matching Solana key', async () => {
    const w = wallet();
    const nonce = issueNonce(w.address, 1_700_000_000_000);
    const message = buildChallenge({ domain: 'nomylax.app', address: w.address, nonce, chain: 'solana:devnet', issuedAt: new Date(1_700_000_000_000).toISOString() });
    const signature = encodeBase58(sign(null, Buffer.from(message), w.privateKey));
    expect(await verifyChallenge({ address: w.address, message, signature })).toBe(true);
  });

  it('rejects message tampering', async () => {
    const w = wallet();
    const nonce = issueNonce(w.address);
    const message = buildChallenge({ domain: 'nomylax.app', address: w.address, nonce, chain: 'solana:devnet' });
    const signature = encodeBase58(sign(null, Buffer.from(message), w.privateKey));
    expect(await verifyChallenge({ address: w.address, message: `${message}!`, signature })).toBe(false);
  });

  it('binds a nonce to the exact case-sensitive address', () => {
    const a = wallet();
    const b = wallet();
    const nonce = issueNonce(a.address);
    expect(consumeNonce(nonce, b.address)).toEqual({ ok: false, reason: 'wrong-address' });
    expect(consumeNonce(nonce, a.address)).toEqual({ ok: true });
  });

  it('refuses nonce replay', () => {
    const w = wallet();
    const nonce = issueNonce(w.address);
    expect(consumeNonce(nonce, w.address)).toEqual({ ok: true });
    expect(consumeNonce(nonce, w.address)).toEqual({ ok: false, reason: 'replayed' });
  });
});
