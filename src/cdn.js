const encodePath = (path = '') =>
  path
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const ghStyle = (host, { owner, repo, ref, path }) =>
  `https://${host}/gh/${owner}/${repo}@${ref}/${encodePath(path)}`;

const githackStyle = (host, { owner, repo, ref, path }) =>
  `https://${host}/${owner}/${repo}/${ref}/${encodePath(path)}`;

const ghSlashStyle = (host, { owner, repo, ref, path }) =>
  `https://${host}/gh/${owner}/${repo}/${ref}/${encodePath(path)}`;

export const cdnProviders = [
  {
    id: 'jsdelivr',
    name: 'jsDelivr',
    site: 'https://www.jsdelivr.com',
    hosts: [
      { host: 'cdn.jsdelivr.net', note: 'main (multi-CDN)' },
      { host: 'fastly.jsdelivr.net', note: 'Fastly' },
      { host: 'gcore.jsdelivr.net', note: 'G-Core' },
      { host: 'testingcf.jsdelivr.net', note: 'Cloudflare' },
      { host: 'quantil.jsdelivr.net', note: 'Quantil' },
      { host: 'originfastly.jsdelivr.net', note: 'Fastly origin' },
    ],
    url: ghStyle,
  },
  {
    id: 'jsd-proxy',
    name: 'jsd-proxy (ygxz.in)',
    site: 'https://jsd-proxy.ygxz.in',
    hosts: [{ host: 'jsd-proxy.ygxz.in', note: 'jsDelivr mirror' }],
    url: ghStyle,
  },
  {
    id: 'jsd-onmicrosoft',
    name: 'jsd.onmicrosoft.cn',
    site: 'https://jsd.onmicrosoft.cn',
    hosts: [{ host: 'jsd.onmicrosoft.cn', note: 'jsDelivr mirror' }],
    url: ghStyle,
  },
  {
    id: 'jsdmirror',
    name: 'JSDMirror',
    site: 'https://jsdmirror.com',
    hosts: [
      { host: 'cdn.jsdmirror.com', note: 'jsDelivr mirror' },
      { host: 'jsdmirror.cn', note: 'jsDelivr mirror (China)' },
    ],
    url: ghStyle,
  },
  {
    id: 'esm.sh',
    name: 'esm.sh',
    site: 'https://esm.sh',
    hosts: [
      { host: 'esm.sh', note: 'ES module build' },
      { host: 'raw.esm.sh', note: 'raw file' },
    ],
    url: ghStyle,
  },
  {
    id: 'githack',
    name: 'GitHack',
    site: 'https://raw.githack.com',
    hosts: [
      { host: 'raw.githack.com', note: 'development (follows branch)' },
      { host: 'rawcdn.githack.com', note: 'production (cached forever)' },
    ],
    url: githackStyle,
  },
  {
    id: 'statically',
    name: 'Statically',
    site: 'https://statically.io',
    hosts: [{ host: 'cdn.statically.io', note: 'GitHub CDN' }],
    url: ghStyle,
  },
  {
    id: 'staticdelivr',
    name: 'StaticDelivr',
    site: 'https://staticdelivr.com',
    hosts: [{ host: 'cdn.staticdelivr.com', note: 'GitHub CDN' }],
    url: ghSlashStyle,
  },
  {
    id: 'mirrors',
    name: 'Community jsDelivr mirrors',
    site: 'https://www.jsdelivr.com',
    hosts: [
      { host: 'jsdelivr.b-cdn.net', note: 'BunnyCDN' },
      { host: 'jsd.nmmsl.top', note: 'community mirror' },
      { host: 'cdn.bili33.top', note: 'community mirror' },
      { host: 'jsd.yizex.cn', note: 'community mirror' },
      { host: 'jsd.proxy.aks.moe', note: 'self-signed TLS certificate', unreliable: true },
      { host: 'jsd.cdn.zzko.cn', note: 'expired TLS certificate', unreliable: true },
      { host: 'cdn.jsdelivr.net.cn', note: 'heavily rate-limited (429)', unreliable: true },
      { host: 'code.webcache.cn', note: 'popular repos only (403 otherwise)', unreliable: true },
      { host: 'jsdelivr.qaq.qa', note: 'whitelisted files only', unreliable: true },
      { host: 'jsdelivr.aby.pub', note: 'whitelisted files only', unreliable: true },
    ],
    url: ghStyle,
  },
];

export function selectProviders(all, ids) {
  if (!ids || ids.length === 0) return all;
  const wanted = ids.map((id) => id.toLowerCase());
  const matches = (p, id) => p.id.toLowerCase() === id || (p.name ?? p.id).toLowerCase() === id;
  const picked = all.filter((p) => wanted.some((id) => matches(p, id)));
  const unknown = wanted.filter((id) => !all.some((p) => matches(p, id)));
  if (unknown.length) {
    throw new Error(
      `Unknown provider(s): ${unknown.join(', ')}. Available: ${all.map((p) => p.id).join(', ')}`,
    );
  }
  return picked;
}

/**
 * Build CDN URLs for a file (or the repo root when `path` is empty) in a GitHub repo.
 * Hosts flagged `unreliable` are only included with `extra: true`.
 */
export function cdnLinks({ owner, repo, ref, path = '', providers, extra = false } = {}) {
  if (!owner || !repo) throw new Error('owner and repo are required');
  if (!ref) throw new Error('ref (branch, tag or commit) is required');
  const target = { owner, repo, ref, path };
  return selectProviders(cdnProviders, providers).flatMap((provider) =>
    provider.hosts.filter((h) => extra || !h.unreliable).map(({ host, note }) => ({
      provider: provider.id,
      providerName: provider.name,
      host,
      note,
      path,
      url: provider.url(host, target),
    })),
  );
}
