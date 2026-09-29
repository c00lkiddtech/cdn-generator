import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

export const DEFAULT_UPLOADCARE_PUBLIC_KEY = '9bb5a429e7696181b9a6';

const MIME_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
};

const isUrl = (s) => /^https?:\/\//i.test(s);

/**
 * Upload a local file path, Buffer/Blob, or public URL to Uploadcare and return its CDN link.
 */
export async function uploadToUploadcare(
  input,
  { publicKey = process.env.UPLOADCARE_PUBLIC_KEY || DEFAULT_UPLOADCARE_PUBLIC_KEY, fileName, store = 'auto' } = {},
) {
  const { UploadClient } = await import('@uploadcare/upload-client');
  // UploadClient defaults baseCDN to the legacy ucarecdn.com, which 404s for newer projects;
  // pointing it at the prefixed zone makes it derive the per-project <prefix>.ucarecd.net host.
  const client = new UploadClient({ publicKey, store, baseCDN: 'https://ucarecd.net' });

  let data = input;
  let name = fileName;
  const options = {};
  if (typeof input === 'string' && !isUrl(input)) {
    data = await readFile(input);
    name ??= basename(input);
    options.contentType = MIME_TYPES[extname(name).toLowerCase()] || 'application/octet-stream';
  } else if (typeof input === 'string') {
    name ??= decodeURIComponent(new URL(input).pathname.split('/').pop() || '') || undefined;
  }
  if (name) options.fileName = name;

  const file = await client.uploadFile(data, options);
  const finalName = file.name || name;
  return {
    uuid: file.uuid,
    name: finalName,
    size: file.size,
    mimeType: file.mimeType,
    cdnUrl: file.cdnUrl,
    url: finalName ? `${file.cdnUrl}${encodeURIComponent(finalName)}` : file.cdnUrl,
  };
}
