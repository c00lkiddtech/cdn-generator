const NAME_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Parse "owner/repo", "owner/repo@ref", GitHub URLs (incl. /tree/<ref>/<path> and /blob/...),
 * "git@github.com:owner/repo.git" and "github:owner/repo".
 */
export function parseRepo(input) {
  let s = String(input ?? '').trim();
  if (!s) throw new Error('A GitHub repository is required (e.g. owner/repo)');

  const isUrl = /^((git\+)?(https?|git|ssh):\/\/|(www\.)?github\.com\/)/i.test(s);
  s = s
    .replace(/^github:/i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/^(git\+)?(https?|git|ssh):\/\/(www\.)?(git@)?github\.com\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(isUrl ? /[?#].*$/ : /\?.*$/, '');

  let ref;
  const hashRef = s.match(/#(.+)$/);
  if (hashRef) {
    ref = hashRef[1];
    s = s.slice(0, hashRef.index);
  }

  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error(`Could not parse GitHub repository from "${input}"`);

  let [owner, repo, ...rest] = parts;
  const atRef = repo.match(/^(.+?)@(.+)$/);
  if (atRef) {
    repo = atRef[1];
    ref = atRef[2];
  }
  repo = repo.replace(/\.git$/, '');

  let path = '';
  if ((rest[0] === 'tree' || rest[0] === 'blob' || rest[0] === 'raw') && rest[1]) {
    ref = rest[1];
    path = rest.slice(2).join('/');
  } else if (rest.length) {
    path = rest.join('/');
  }

  if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    throw new Error(`Could not parse GitHub repository from "${input}"`);
  }
  return { owner, repo, ref: ref && safeDecode(ref), path: safeDecode(path) };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const defaultToken = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function gh(pathname, { token = defaultToken(), accept = 'application/vnd.github+json' } = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: accept,
      'User-Agent': 'cdn-generator',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = (await res.json()).message || message;
    } catch {}
    if (res.status === 403 || res.status === 429) {
      message += ' (GitHub API rate limit — set GITHUB_TOKEN to raise it)';
    }
    const err = new Error(`GitHub API ${pathname}: ${message}`);
    err.status = res.status;
    throw err;
  }
  return accept.includes('sha') ? (await res.text()).trim() : res.json();
}

export async function getDefaultBranch(owner, repo, opts) {
  const data = await gh(`/repos/${owner}/${repo}`, opts);
  return data.default_branch;
}

export async function getCommitSha(owner, repo, ref, opts) {
  return gh(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
    ...opts,
    accept: 'application/vnd.github.sha',
  });
}

/**
 * Fill in the ref (default branch when missing) and optionally pin it to a commit SHA.
 */
export async function resolveRepo({ owner, repo, ref, path = '' }, { pin = false, token } = {}) {
  const branch = ref || (await getDefaultBranch(owner, repo, { token }));
  const resolved = pin ? await getCommitSha(owner, repo, branch, { token }) : branch;
  return { owner, repo, ref: resolved, path, originalRef: branch };
}

/**
 * List every file path in the repo at `ref`, optionally limited to a sub-directory.
 * Falls back to the jsDelivr data API if the GitHub API is unavailable.
 */
export async function listFiles({ owner, repo, ref, path = '' }, { token } = {}) {
  const prefix = path.replace(/^\/+|\/+$/g, '');
  const within = (p) => !prefix || p === prefix || p.startsWith(`${prefix}/`);

  try {
    const tree = await gh(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { token },
    );
    const files = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path).filter(within);
    return { files, truncated: Boolean(tree.truncated), source: 'github' };
  } catch (githubError) {
    const res = await fetch(
      `https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${encodeURIComponent(ref)}?structure=flat`,
    );
    if (!res.ok) throw githubError;
    const data = await res.json();
    const files = (data.files || []).map((f) => f.name.replace(/^\//, '')).filter(within);
    return { files, truncated: false, source: 'jsdelivr' };
  }
}
