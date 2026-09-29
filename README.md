# cdn-generator

Turn any public GitHub repo into ready-to-use CDN links, upload files to Uploadcare, or turn any IP address into wildcard-DNS hostnames. Works as a CLI or a library.

> CDNs like jsDelivr don't need an upload: they serve files straight from public GitHub repos. `cdn-generator` builds the correct URL for every service and subdomain, and can verify that each one actually works.

## Install

```bash
npm install -g cdn-generator
# or run without installing
npx cdn-generator
```

## Usage

Run `cdn-generator` (or `cdngen`) with no arguments for an interactive menu with three categories:

1. **CDN** — GitHub repo → CDN links
2. **Wildcard** — IP address → wildcard DNS hostnames
3. **Gens** — upload a file → Uploadcare or c99 links

Or call each category directly:

```bash
cdn-generator generate https://github.com/owner/repo   # 1) CDN
cdn-generator generate 192.168.1.10                    # 2) Wildcard
cdn-generator upload ./logo.svg                        # 3) Gens
```

For category 1, `generate` is optional (`cdn-generator https://github.com/owner/repo` does the same):

- Repo URL: links every file in the repo
- Folder URL (`/tree/<branch>/<folder>`): links every file in that folder
- File URL (`/blob/<branch>/<file>`): links just that file

## 1) CDN: GitHub repo → CDN links

| Service | Hosts |
| --- | --- |
| [jsDelivr](https://www.jsdelivr.com) | `cdn`, `fastly`, `gcore`, `testingcf`, `quantil`, `originfastly` `.jsdelivr.net` |
| [jsd-proxy](https://jsd-proxy.ygxz.in) | `jsd-proxy.ygxz.in` |
| [jsd.onmicrosoft.cn](https://jsd.onmicrosoft.cn) | `jsd.onmicrosoft.cn` |
| [JSDMirror](https://jsdmirror.com) | `cdn.jsdmirror.com`, `jsdmirror.cn` |
| [esm.sh](https://esm.sh) | `esm.sh` (ES module build), `raw.esm.sh` (raw file) |
| [GitHack](https://raw.githack.com) | `raw.githack.com` (dev), `rawcdn.githack.com` (prod) |
| [Statically](https://statically.io) | `cdn.statically.io` |
| [StaticDelivr](https://staticdelivr.com) | `cdn.staticdelivr.com` |
| Community jsDelivr mirrors | `jsdelivr.b-cdn.net`, `jsd.nmmsl.top`, `cdn.bili33.top`, `jsd.yizex.cn` |
| [Uploadcare](https://uploadcare.com) | `<project>.ucarecd.net` (with `--uploadcare`, see below) |
| [c99](https://upload.c99.nl) | several reputable domains (with `--c99`, see below) |

`--extra` also adds mirrors that only work some of the time: `jsd.proxy.aks.moe` (self-signed certificate), `jsd.cdn.zzko.cn` (expired certificate), `cdn.jsdelivr.net.cn` (rate-limited), `code.webcache.cn` (popular repos only), `jsdelivr.qaq.qa` and `jsdelivr.aby.pub` (whitelisted files only).

```bash
# every file, every CDN
cdn-generator https://github.com/jquery/jquery

# one file, and check every link returns 200
cdn-generator https://github.com/jquery/jquery/blob/3.7.1/dist/jquery.min.js --check

# a folder, saved as Markdown
cdn-generator https://github.com/jquery/jquery/tree/3.7.1/dist --md -o links.md

# only the base URLs (append any path yourself)
cdn-generator https://github.com/jquery/jquery --root

# pin the default branch to its latest commit SHA (safe for production caching)
cdn-generator https://github.com/owner/repo --pin

# only some providers
cdn-generator https://github.com/owner/repo -p jsdelivr,githack
```

Accepted repo formats: `owner/repo`, `owner/repo@ref`, `owner/repo#ref`, `github:owner/repo`, `git@github.com:owner/repo.git`, and GitHub URLs including `/tree/<ref>/<path>` and `/blob/<ref>/<path>`.

Branch links are cached by the CDNs (jsDelivr caches branches for up to 12h, `rawcdn.githack.com` forever), so use a tag or `--pin` for production.

## 3) Gens: upload a copy (Uploadcare and c99)

Unlike the CDNs above, these services store their own copy of the file, so they work for files that aren't on GitHub.

- **Uploadcare** (`--uploadcare`): one link on your Uploadcare CDN. A built-in public key is used by default; use your own with `--uploadcare-key <key>` or `UPLOADCARE_PUBLIC_KEY=<key>`.
- **c99** (`--c99`): uses [upload.c99.nl](https://upload.c99.nl), which stores the file on several reputable help-center domains (figma, cpanel, washingtonpost, and more) and returns a link for each.

```bash
# upload local files (or public URLs) to Uploadcare
cdn-generator upload ./logo.svg ./banner.png

# upload to c99 instead (many domains)
cdn-generator upload ./logo.svg --c99

# generate CDN links for a GitHub file and also copy it (max 25 files per run)
cdn-generator generate https://github.com/owner/repo/blob/main/logo.svg --uploadcare --c99
```

## 2) Wildcard: IP → wildcard DNS hostnames

| Service | Formats | IPv6 |
| --- | --- | --- |
| [nip.io](https://nip.io) | `10.0.0.1.nip.io`, `10-0-0-1.nip.io`, `0a000001.nip.io` | yes |
| [sslip.io](https://sslip.io) | `10.0.0.1.sslip.io`, `10-0-0-1.sslip.io`, `0a000001.sslip.io` | yes |
| [traefik.me](https://traefik.me) | `10.0.0.1.traefik.me`, `10-0-0-1.traefik.me` | yes |
| [backname.io](https://backname.io) | `10.0.0.1.backname.io`, `10-0-0-1.backname.io` | yes |
| [anyip.dev](https://anyip.dev) | `10-0-0-1.anyip.dev` | yes |
| [local-ip.sh](https://local-ip.sh) | `10.0.0.1.local-ip.sh`, `10-0-0-1.local-ip.sh` | no |

```bash
cdn-generator 192.168.1.10
cdn-generator 192.168.1.10 --sub app --port 3000   # app.192.168.1.10.nip.io:3000, app-192-168-1-10.nip.io:3000, ...
cdn-generator 2a01:4f8:c17:b8f::2                  # 2a01-4f8-c17-b8f--2.sslip.io, ...
cdn-generator 10.0.0.1 --check                     # resolve every hostname and confirm it points at the IP
```

## Other commands

```bash
cdn-generator providers        # list every service and host
cdn-generator --help
```

Output flags work in both modes: `--json`, `--md`, `-o <file>`.

Set `GITHUB_TOKEN` (or `GH_TOKEN`) to raise the GitHub API rate limit when using `--all`, `--pin`, or the default branch lookup. If the GitHub API is unavailable, file listing falls back to the jsDelivr data API.

## Library

```js
import { cdnLinks, generateRepoLinks, uploadToUploadcare, uploadToC99, wildcardHosts, checkUrls, checkHosts } from 'cdn-generator';

cdnLinks({ owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.min.js' });
// [{ provider: 'jsdelivr', host: 'cdn.jsdelivr.net', url: 'https://cdn.jsdelivr.net/gh/jquery/jquery@3.7.1/dist/jquery.min.js', ... }, ...]

const result = await generateRepoLinks('https://github.com/jquery/jquery/tree/3.7.1/dist');
// { owner, repo, ref, base: [...], files: [{ path, links: [...] }, ...] }

await uploadToUploadcare('./logo.svg'); // also accepts a Buffer, Blob or public URL
// { uuid, name, size, mimeType, cdnUrl, url: 'https://<project>.ucarecd.net/<uuid>/logo.svg' }

await uploadToC99('./logo.svg'); // one result per reputable domain
// { name: 'logo.svg', results: [{ domain: 'help.figma.com', ok: true, url: 'https://help.figma.com/attachments/token/.../?name=logo.svg' }, ...] }

wildcardHosts('10.0.0.1', { sub: 'app', port: 8080 });
// [{ provider: 'nip.io', format: 'dot', host: 'app.10.0.0.1.nip.io', url: 'http://app.10.0.0.1.nip.io:8080' }, ...]

await checkUrls(cdnLinks({ owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.js' }));
await checkHosts(wildcardHosts('10.0.0.1'), '10.0.0.1');
```

TypeScript types are included.

## License

MIT
