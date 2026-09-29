export { cdnProviders, cdnLinks } from './cdn.js';
export { wildcardProviders, wildcardHosts, ipForms, normalizeIp } from './wildcard.js';
export { parseRepo, resolveRepo, listFiles, getDefaultBranch, getCommitSha } from './github.js';
export { checkUrls, checkHosts } from './check.js';
export { uploadToUploadcare, DEFAULT_UPLOADCARE_PUBLIC_KEY } from './uploadcare.js';
export { uploadToC99, C99_DOMAINS } from './c99.js';

import { cdnLinks } from './cdn.js';
import { parseRepo, resolveRepo, listFiles } from './github.js';
import { uploadToUploadcare } from './uploadcare.js';
import { uploadToC99 } from './c99.js';

export const MAX_UPLOADCARE_FILES = 25;

const rawGithubUrl = ({ owner, repo, ref }, path) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

/**
 * One-shot helper: parse a repo string or GitHub URL, resolve the ref and build CDN links
 * for every file (limited to the folder/file in the URL, or to `files` when given).
 * With `uploadcare` or `c99` set, each file is also uploaded there and its link(s) appended.
 */
export async function generateRepoLinks(
  input,
  { ref, pin, all, files, providers, extra, uploadcare, c99, token } = {},
) {
  const parsed = parseRepo(input);
  const target = await resolveRepo({ ...parsed, ref: ref || parsed.ref }, { pin, token });

  let paths = files?.length ? files : [target.path];
  let truncated = false;
  if (all ?? !files?.length) {
    const listing = await listFiles(target, { token });
    paths = listing.files;
    truncated = listing.truncated;
    if (!paths.length) {
      throw new Error(`No files found in ${target.owner}/${target.repo}@${target.ref}/${target.path}`);
    }
  }

  const result = {
    ...target,
    truncated,
    base: cdnLinks({ ...target, path: '', providers, extra }),
    files: paths.map((path) => ({ path, links: cdnLinks({ ...target, path, providers, extra }) })),
  };

  if (uploadcare || c99) {
    if (result.files.length > MAX_UPLOADCARE_FILES) {
      throw new Error(
        `Refusing to upload ${result.files.length} files (max ${MAX_UPLOADCARE_FILES}). ` +
          'Use a file or folder URL instead.',
      );
    }
    const ucOptions = typeof uploadcare === 'object' ? uploadcare : {};
    const c99Options = typeof c99 === 'object' ? c99 : {};
    for (const file of result.files) {
      const source = rawGithubUrl(target, file.path);
      if (uploadcare) {
        const uploaded = await uploadToUploadcare(source, ucOptions);
        file.links.push({
          provider: 'uploadcare',
          providerName: 'Uploadcare',
          host: new URL(uploaded.cdnUrl).host,
          note: `uploaded copy (uuid ${uploaded.uuid})`,
          path: file.path,
          url: uploaded.url,
        });
      }
      if (c99) {
        const { results } = await uploadToC99(source, c99Options);
        for (const r of results.filter((x) => x.ok)) {
          file.links.push({
            provider: 'c99',
            providerName: 'c99 (upload.c99.nl)',
            host: r.domain,
            note: 'uploaded copy',
            path: file.path,
            url: r.url,
          });
        }
      }
    }
  }

  return result;
}
