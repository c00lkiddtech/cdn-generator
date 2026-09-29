import { promises as dns } from 'node:dns';
import { normalizeIp } from './wildcard.js';

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Request each URL and attach `status` / `ok` to every link. */
export async function checkUrls(links, { concurrency = 8, timeout = 15000 } = {}) {
  return pool(links, concurrency, async (link) => {
    try {
      const res = await fetch(link.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'cdn-generator' },
      });
      res.body?.cancel().catch(() => {});
      return { ...link, status: res.status, ok: res.ok };
    } catch (err) {
      const error = err.name === 'TimeoutError' ? 'timeout' : err.cause?.code || err.message;
      return { ...link, status: 0, ok: false, error };
    }
  });
}

/** Resolve each hostname and attach `resolved` / `ok` (true when it points at `ip`). */
export async function checkHosts(hosts, ip, { concurrency = 8 } = {}) {
  const { ip: target, version } = normalizeIp(ip);
  const expand = (a) => (version === 6 ? new URL(`http://[${a}]`).hostname : a);
  const want = expand(target);
  return pool(hosts, concurrency, async (entry) => {
    try {
      const addrs = version === 6 ? await dns.resolve6(entry.host) : await dns.resolve4(entry.host);
      return { ...entry, resolved: addrs, ok: addrs.map(expand).includes(want) };
    } catch (err) {
      return { ...entry, resolved: [], ok: false, error: err.code || err.message };
    }
  });
}
