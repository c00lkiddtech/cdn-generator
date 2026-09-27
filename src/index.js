export { cdnProviders, cdnLinks } from './cdn.js';
export { wildcardProviders, wildcardHosts, ipForms, normalizeIp } from './wildcard.js';
export { parseRepo, resolveRepo, listFiles, getDefaultBranch, getCommitSha } from './github.js';
export { checkUrls, checkHosts } from './check.js';

import { cdnLinks } from './cdn.js';
import { parseRepo, resolveRepo, listFiles } from './github.js';

/**
 * One-shot helper: parse a repo string, resolve the ref and build CDN links.
 * With `all: true` links are generated for every file in the repo.
 */
export async function generateRepoLinks(input, { ref, pin, all, files, providers, token } = {}) {
  const parsed = parseRepo(input);
  const target = await resolveRepo({ ...parsed, ref: ref || parsed.ref }, { pin, token });

  let paths = files?.length ? files : [target.path];
  let truncated = false;
  if (all) {
    const listing = await listFiles(target, { token });
    paths = listing.files;
    truncated = listing.truncated;
  }

  return {
    ...target,
    truncated,
    files: paths.map((path) => ({ path, links: cdnLinks({ ...target, path, providers }) })),
  };
}
