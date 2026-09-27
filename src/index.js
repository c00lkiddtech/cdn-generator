export { cdnProviders, cdnLinks } from './cdn.js';
export { wildcardProviders, wildcardHosts, ipForms, normalizeIp } from './wildcard.js';
export { parseRepo, resolveRepo, listFiles, getDefaultBranch, getCommitSha } from './github.js';
export { checkUrls, checkHosts } from './check.js';

import { cdnLinks } from './cdn.js';
import { parseRepo, resolveRepo, listFiles } from './github.js';

/**
 * One-shot helper: parse a repo string or GitHub URL, resolve the ref and build CDN links
 * for every file (limited to the folder/file in the URL, or to `files` when given).
 */
export async function generateRepoLinks(input, { ref, pin, all, files, providers, token } = {}) {
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

  return {
    ...target,
    truncated,
    base: cdnLinks({ ...target, path: '', providers }),
    files: paths.map((path) => ({ path, links: cdnLinks({ ...target, path, providers }) })),
  };
}
