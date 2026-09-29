import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

/**
 * upload.c99.nl works by POSTing a file to the public Zendesk upload API
 * (`/api/v2/uploads.json`) of several help-center domains, then serving it back from
 * each domain's own `mapped_content_url`. This is the same list the c99 uploader uses.
 */
export const C99_DOMAINS = [
  'helpcenter.washingtonpost.com',
  'www.ilcourthelp.gov',
  'support.cpanel.net',
  'help.figma.com',
  'en.help.roblox.com',
  'help.soundcloud.com',
  'support.pokemon.com',
  'lwdsupport.tn.gov',
];

const isUrl = (s) => /^https?:\/\//i.test(s);

async function toBytes(input) {
  if (typeof input !== 'string') {
    if (input instanceof Uint8Array) return { data: input };
    if (typeof Blob !== 'undefined' && input instanceof Blob) {
      return { data: new Uint8Array(await input.arrayBuffer()) };
    }
    throw new Error('Unsupported input: pass a file path, URL, Buffer or Blob');
  }
  if (isUrl(input)) {
    const res = await fetch(input, { headers: { 'User-Agent': 'cdn-generator' } });
    if (!res.ok) throw new Error(`Could not fetch ${input}: ${res.status} ${res.statusText}`);
    const name = decodeURIComponent(new URL(input).pathname.split('/').pop() || '') || undefined;
    return { data: new Uint8Array(await res.arrayBuffer()), name };
  }
  return { data: await readFile(input), name: basename(input) };
}

async function uploadOne(domain, data, fileName, timeout) {
  try {
    const res = await fetch(
      `https://${domain}/api/v2/uploads.json?filename=${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'User-Agent': 'cdn-generator' },
        body: data,
        signal: AbortSignal.timeout(timeout),
      },
    );
    const body = await res.json().catch(() => ({}));
    const attachment = body?.upload?.attachments?.[0];
    const url = attachment?.mapped_content_url || attachment?.content_url;
    if (!res.ok || !url) {
      const reason =
        body?.description || body?.error?.message || body?.error || `HTTP ${res.status}`;
      return { domain, ok: false, error: String(reason) };
    }
    return { domain, ok: true, url, size: attachment.size, contentType: attachment.content_type };
  } catch (err) {
    return { domain, ok: false, error: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

/**
 * Upload a local file path, Buffer/Blob or public URL to the c99 (Zendesk) mirror domains.
 * Returns one result per domain; failures are kept with `ok: false` and an `error`.
 */
export async function uploadToC99(
  input,
  { fileName, domains = C99_DOMAINS, timeout = 25000 } = {},
) {
  const { data, name } = await toBytes(input);
  const finalName = fileName || name || 'file';
  const results = await Promise.all(domains.map((d) => uploadOne(d, data, finalName, timeout)));
  if (!results.some((r) => r.ok)) {
    throw new Error(`c99 upload failed on every domain (${results[0]?.error || 'unknown error'})`);
  }
  return { name: finalName, results };
}
