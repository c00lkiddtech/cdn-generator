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

Give `generate` a GitHub URL. It finds the default branch, lists every file, and prints the link for each file on every CDN:

```bash
cdn-generator generate https://github.com/owner/repo
```

`generate` is optional (`cdn-generator https://github.com/owner/repo` does the same), or run `cdn-generator` (or `cdngen`) with no arguments and paste the URL when asked.

- Repo URL: links every file in the repo
- Folder URL (`/tree/<branch>/<folder>`): links every file in that folder
- File URL (`/blob/<branch>/<file>`): links just that file
- An IP address instead of a URL: wildcard DNS hostnames (mode 2 below)

## Mode 1: GitHub repo → CDN links

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

## Uploadcare

Unlike the CDNs above, Uploadcare stores its own copy of the file.

```bash
# upload local files (or public URLs) and print their Uploadcare links
cdn-generator upload ./logo.svg ./banner.png

# generate links for a GitHub file and also copy it to Uploadcare (max 25 files per run)
cdn-generator generate https://github.com/owner/repo/blob/main/logo.svg --uploadcare
```

A built-in public key is used by default. Use your own with `--uploadcare-key <key>` or `UPLOADCARE_PUBLIC_KEY=<key>`.

## Mode 2: IP → wildcard DNS hostnames

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
import { cdnLinks, generateRepoLinks, uploadToUploadcare, wildcardHosts, checkUrls, checkHosts } from 'cdn-generator';

cdnLinks({ owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.min.js' });
// [{ provider: 'jsdelivr', host: 'cdn.jsdelivr.net', url: 'https://cdn.jsdelivr.net/gh/jquery/jquery@3.7.1/dist/jquery.min.js', ... }, ...]

const result = await generateRepoLinks('https://github.com/jquery/jquery/tree/3.7.1/dist');
// { owner, repo, ref, base: [...], files: [{ path, links: [...] }, ...] }

await uploadToUploadcare('./logo.svg'); // also accepts a Buffer, Blob or public URL
// { uuid, name, size, mimeType, cdnUrl, url: 'https://<project>.ucarecd.net/<uuid>/logo.svg' }

wildcardHosts('10.0.0.1', { sub: 'app', port: 8080 });
// [{ provider: 'nip.io', format: 'dot', host: 'app.10.0.0.1.nip.io', url: 'http://app.10.0.0.1.nip.io:8080' }, ...]

await checkUrls(cdnLinks({ owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.js' }));
await checkHosts(wildcardHosts('10.0.0.1'), '10.0.0.1');
```

TypeScript types are included.

## License

MIT
