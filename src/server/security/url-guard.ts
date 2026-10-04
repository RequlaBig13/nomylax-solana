/**
 * Server side request forgery guard for outbound agent calls.
 *
 * Nomylax attaches credentials to outbound requests, so an attacker who can
 * choose the destination can steal them. Every outbound URL passes through
 * assertSafeUrl, and the destination itself is loaded from storage rather than
 * taken from the request body.
 */

export class UnsafeUrlError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data',
]);

/** Cloud instance metadata services, the classic SSRF credential target. */
const BLOCKED_IPS = new Set([
  '169.254.169.254', '169.254.170.2', '100.100.100.200', 'fd00:ec2::254',
]);

export interface UrlGuardOptions {
  /** Production requires https. Development may allow http for local agents. */
  requireHttps?: boolean;
  /** When present, the host must match one of these exactly. */
  allowlist?: string[];
}

export function assertSafeUrl(raw: string, opts: UrlGuardOptions = {}): URL {
  const requireHttps = opts.requireHttps ?? process.env.NODE_ENV === 'production';

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Endpoint is not a valid URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError(`Protocol ${url.protocol} is not permitted`);
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Endpoint must use https');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Credentials in the URL are not permitted');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(host)) throw new UnsafeUrlError(`Host ${host} is not permitted`);
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError(`Host ${host} resolves to an internal namespace`);
  }
  if (BLOCKED_IPS.has(host)) throw new UnsafeUrlError('Cloud metadata endpoints are not permitted');
  if (isPrivateAddress(host)) throw new UnsafeUrlError(`Host ${host} is a private or reserved address`);

  if (opts.allowlist?.length) {
    const ok = opts.allowlist.some((a) => a.trim().toLowerCase() === host);
    if (!ok) throw new UnsafeUrlError(`Host ${host} is not on the endpoint allowlist`);
  }

  return url;
}

export function isPrivateAddress(host: string): boolean {
  if (isIPv4(host)) return isPrivateIPv4(host);
  if (host.includes(':')) {
    const g = expandIPv6(host);
    if (!g) return true; // unparseable IPv6 is refused rather than trusted
    return isPrivateIPv6(g);
  }
  return false;
}

function isPrivateIPv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number);
  if (a === 10) return true;                          // 10/8
  if (a === 127) return true;                         // loopback
  if (a === 0) return true;                           // this network
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
  if (a === 192 && b === 168) return true;            // 192.168/16
  if (a === 169 && b === 254) return true;            // link local
  if (a === 100 && b >= 64 && b <= 127) return true;  // carrier grade NAT
  if (a >= 224) return true;                          // multicast and reserved
  return false;
}

function isPrivateIPv6(g: number[]): boolean {
  const allZero = g.every((n) => n === 0);
  if (allZero) return true;                                   // ::
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1

  if ((g[0] & 0xfe00) === 0xfc00) return true;                // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;                // fe80::/10 link local

  // IPv4 mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96). The WHATWG URL
  // parser rewrites the dotted form into hex, so the check must work on groups.
  const mapped = g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0);
  const compat = g.slice(0, 6).every((n) => n === 0);         // deprecated ::a.b.c.d
  if (mapped || nat64 || compat) {
    const v4 = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
    return isPrivateIPv4(v4);
  }
  return false;
}

/** Expand any IPv6 form into eight 16 bit groups. Returns null if malformed. */
export function expandIPv6(input: string): number[] | null {
  let s = input.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];

  const v4 = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const p = v4[1].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    s = s.slice(0, -v4[1].length) +
      (((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16));
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];

  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill('0'), ...tail];
  }

  const nums = groups.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return nums.length === 8 && nums.every((n) => Number.isInteger(n)) ? nums : null;
}

function isIPv4(h: string): boolean {
  const parts = h.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
