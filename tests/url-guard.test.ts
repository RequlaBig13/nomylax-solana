import { describe, it, expect } from 'vitest';
import { assertSafeUrl, UnsafeUrlError, isPrivateAddress } from '@/server/security/url-guard';

const rejects = (u: string, opts = {}) => expect(() => assertSafeUrl(u, opts)).toThrow(UnsafeUrlError);

describe('SSRF guard', () => {
  it('accepts an ordinary public https endpoint', () => {
    expect(assertSafeUrl('https://agent.example.com/intents').hostname).toBe('agent.example.com');
  });

  it('rejects loopback and localhost', () => {
    rejects('https://localhost/intents');
    rejects('https://127.0.0.1/intents');
    rejects('https://[::1]/intents');
  });

  it('rejects cloud metadata endpoints', () => {
    rejects('https://169.254.169.254/latest/meta-data/iam/security-credentials/');
    rejects('https://metadata.google.internal/computeMetadata/v1/');
    rejects('https://100.100.100.200/');
  });

  it('rejects private and reserved ranges', () => {
    ['10.0.0.5', '172.16.4.2', '172.31.255.1', '192.168.1.1', '169.254.1.1', '0.0.0.0', '224.0.0.1']
      .forEach((ip) => rejects(`https://${ip}/x`));
  });

  it('rejects IPv6 unique local, link local, loopback and unspecified', () => {
    rejects('https://[fd00::1]/x');
    rejects('https://[fe80::1]/x');
    rejects('https://[::1]/x');
    rejects('https://[::]/x');
  });

  it('rejects IPv4 mapped IPv6 in every notation the URL parser produces', () => {
    // The WHATWG parser rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1, which is
    // how a naive dotted-quad check gets bypassed.
    rejects('https://[::ffff:127.0.0.1]/x');
    rejects('https://[::ffff:7f00:1]/x');
    rejects('https://[::ffff:10.0.0.1]/x');
    rejects('https://[::ffff:a9fe:a9fe]/x');   // 169.254.169.254, metadata
    rejects('https://[64:ff9b::7f00:1]/x');    // NAT64 embedding loopback
  });

  it('permits genuinely public IPv6', () => {
    expect(assertSafeUrl('https://[2606:4700:4700::1111]/x')).toBeTruthy();
    expect(assertSafeUrl('https://[::ffff:8.8.8.8]/x')).toBeTruthy();
  });

  it('refuses malformed IPv6 rather than trusting it', () => {
    expect(isPrivateAddress('1:2:3')).toBe(true);
    expect(isPrivateAddress('::ffff::1')).toBe(true);
  });

  it('rejects internal namespaces', () => {
    rejects('https://vault.internal/x');
    rejects('https://printer.local/x');
  });

  it('rejects non http protocols and embedded credentials', () => {
    rejects('file:///etc/passwd');
    rejects('gopher://example.com/x');
    rejects('https://user:pass@example.com/x');
    rejects('not a url');
  });

  it('enforces https when required', () => {
    rejects('http://agent.example.com/x', { requireHttps: true });
    expect(assertSafeUrl('http://agent.example.com/x', { requireHttps: false }).protocol).toBe('http:');
  });

  it('enforces an allowlist when one is configured', () => {
    rejects('https://evil.example.com/x', { allowlist: ['agent.example.com'] });
    expect(assertSafeUrl('https://agent.example.com/x', { allowlist: ['agent.example.com'] })).toBeTruthy();
  });

  it('treats public addresses as public', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
  });
});
