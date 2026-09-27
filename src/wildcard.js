import { isIP } from 'node:net';
import { selectProviders } from './cdn.js';

export const wildcardProviders = [
  {
    id: 'nip.io',
    site: 'https://nip.io',
    formats: ['dot', 'dash', 'hex'],
    ipv6: true,
    subSeparators: ['.', '-'],
  },
  {
    id: 'sslip.io',
    site: 'https://sslip.io',
    formats: ['dot', 'dash', 'hex'],
    ipv6: true,
    subSeparators: ['.', '-'],
  },
  {
    id: 'traefik.me',
    site: 'https://traefik.me',
    formats: ['dot', 'dash'],
    ipv6: true,
    subSeparators: ['.', '-'],
  },
  {
    id: 'backname.io',
    site: 'https://backname.io',
    formats: ['dot', 'dash'],
    ipv6: true,
    subSeparators: ['.'],
  },
  {
    id: 'anyip.dev',
    site: 'https://anyip.dev',
    formats: ['dash'],
    ipv6: true,
    subSeparators: ['.', '-'],
  },
  {
    id: 'local-ip.sh',
    site: 'https://local-ip.sh',
    formats: ['dot', 'dash'],
    ipv6: false,
    subSeparators: ['.'],
  },
];

const SUB_RE = /^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))*$/i;

export function normalizeIp(input) {
  const ip = String(input ?? '').trim().replace(/^\[|\]$/g, '');
  const version = isIP(ip);
  if (!version) throw new Error(`"${input}" is not a valid IPv4 or IPv6 address`);
  if (version === 6 && ip.includes('.')) {
    throw new Error('IPv4-mapped IPv6 addresses are not supported, use the plain IPv4 address');
  }
  return { ip: version === 6 ? ip.toLowerCase() : ip, version };
}

export function ipForms(input) {
  const { ip, version } = normalizeIp(input);
  if (version === 6) {
    let dash = ip.replace(/:/g, '-');
    if (dash.startsWith('-')) dash = `0${dash}`;
    if (dash.endsWith('-')) dash = `${dash}0`;
    return { version, dash };
  }
  const octets = ip.split('.').map(Number);
  return {
    version,
    dot: ip,
    dash: octets.join('-'),
    hex: octets.map((o) => o.toString(16).padStart(2, '0')).join(''),
  };
}

/**
 * Build wildcard-DNS hostnames that resolve to `ip` for every supported provider/format.
 */
export function wildcardHosts(ip, { sub, providers, port, protocol = 'http' } = {}) {
  const forms = ipForms(ip);
  if (sub != null && sub !== '' && !SUB_RE.test(sub)) {
    throw new Error(`"${sub}" is not a valid subdomain (letters, digits, "-" and "." only)`);
  }
  if (port != null && !(Number.isInteger(Number(port)) && port > 0 && port < 65536)) {
    throw new Error(`"${port}" is not a valid port`);
  }
  const suffix = port ? `:${port}` : '';
  const results = [];

  for (const provider of selectProviders(wildcardProviders, providers)) {
    if (forms.version === 6 && !provider.ipv6) continue;
    const formats = forms.version === 6 ? ['dash'] : provider.formats;

    for (const format of formats) {
      const ipLabel = forms[format];
      const candidates = [];
      if (!sub) {
        candidates.push(`${ipLabel}.${provider.id}`);
      } else {
        if (provider.subSeparators.includes('.')) candidates.push(`${sub}.${ipLabel}.${provider.id}`);
        if (provider.subSeparators.includes('-') && format === 'dash' && !sub.includes('.')) {
          candidates.push(`${sub}-${ipLabel}.${provider.id}`);
        }
      }
      for (const host of candidates) {
        results.push({
          provider: provider.id,
          format: forms.version === 6 ? 'ipv6' : format,
          host,
          url: `${protocol}://${host}${suffix}`,
        });
      }
    }
  }
  return results;
}
