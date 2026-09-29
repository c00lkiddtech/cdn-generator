#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { isIP } from 'node:net';
import {
  cdnProviders,
  wildcardProviders,
  generateRepoLinks,
  wildcardHosts,
  checkUrls,
  checkHosts,
  uploadToUploadcare,
  uploadToC99,
  MAX_UPLOADCARE_FILES,
} from '../src/index.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `cdn-generator v${pkg.version}

Three categories:
  1) CDN       GitHub repo -> CDN links (jsDelivr, esm.sh, GitHack, mirrors)
  2) Wildcard  IP address -> wildcard DNS hostnames (nip.io, sslip.io, ...)
  3) Gens      upload a file -> Uploadcare or c99 links

Usage:
  cdn-generator generate <github-url>   1) CDN links for every file in the repo
  cdn-generator generate <ip>           2) wildcard DNS hostnames for the IP
  cdn-generator upload <file|url>       3) upload a file (Uploadcare, or c99 with --c99)
  cdn-generator providers               list all supported services
  cdn-generator                         interactive menu for all three categories

  "generate" is optional: cdn-generator <github-url> works the same.

Examples:
  cdn-generator generate https://github.com/jquery/jquery
  cdn-generator generate https://github.com/jquery/jquery/blob/3.7.1/dist/jquery.min.js --uploadcare --c99
  cdn-generator upload ./logo.svg --c99
  cdn-generator generate 192.168.1.10 --sub app

Repo options:
  -r, --ref <ref>        branch, tag or commit (default: from the URL, else the default branch)
  -f, --file <path>      only link these files (repeatable)
      --root             only print the base URLs, not every file
      --pin              resolve the ref to a commit SHA (best for production)
  -e, --extra            also include unreliable mirrors (rate-limited, whitelist-only, bad TLS)
  -u, --uploadcare       only upload to Uploadcare (skip c99)
      --c99              only upload via c99 (skip Uploadcare)
      --no-upload        skip uploads (CDN links only)

By default a repo run does everything except wildcard DNS: CDN links for every file
PLUS an Uploadcare and c99 upload of each file (up to 25 files). Narrow it with
--uploadcare or --c99, or turn uploads off with --no-upload.

Upload command:
  cdn-generator upload <file|url> [...]   uploads to Uploadcare (default) or --c99

Uploadcare options:
      --uploadcare-key <key>  Uploadcare public key (default: $UPLOADCARE_PUBLIC_KEY or built-in)

IP options:
  -s, --sub <name>       subdomain prefix, e.g. "app" -> app.10.0.0.1.nip.io
      --port <port>      append a port to the generated URLs
      --https            use https:// in generated URLs

Common options:
  -p, --provider <id>    only use these providers (repeatable or comma-separated)
  -c, --check            verify every URL (HTTP) / hostname (DNS)
      --json             output JSON
      --md               output Markdown
  -o, --out <file>       write output to a file
  -h, --help             show help
  -v, --version          show version

Env: GITHUB_TOKEN / GH_TOKEN raises the GitHub API rate limit.`;

const options = {
  ref: { type: 'string', short: 'r' },
  file: { type: 'string', short: 'f', multiple: true },
  all: { type: 'boolean', short: 'a' },
  root: { type: 'boolean' },
  pin: { type: 'boolean' },
  extra: { type: 'boolean', short: 'e' },
  uploadcare: { type: 'boolean', short: 'u' },
  'uploadcare-key': { type: 'string' },
  c99: { type: 'boolean' },
  'no-upload': { type: 'boolean' },
  sub: { type: 'string', short: 's' },
  port: { type: 'string' },
  https: { type: 'boolean' },
  provider: { type: 'string', short: 'p', multiple: true },
  check: { type: 'boolean', short: 'c' },
  json: { type: 'boolean' },
  md: { type: 'boolean' },
  out: { type: 'string', short: 'o' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const red = paint(31);
const cyan = paint(36);

const statusTag = (entry) => {
  if (entry.ok === undefined) return '';
  if (entry.ok) return green(entry.status ? ` [${entry.status}]` : ' [ok]');
  return red(` [${entry.status || entry.error || 'fail'}]`);
};

function renderRepo(result, format) {
  if (format === 'json') return JSON.stringify(result, null, 2);
  const title = `${result.owner}/${result.repo}@${result.ref}`;

  const files = result.root ? [] : result.files;
  const count = `${result.files.length} file${result.files.length === 1 ? '' : 's'}`;

  if (format === 'md') {
    const table = (links) => {
      const rows = ['| Provider | Host | URL |', '| --- | --- | --- |'];
      for (const l of links) {
        const status = l.ok === undefined ? '' : l.ok ? ' ✅' : ` ❌ ${l.status || l.error}`;
        rows.push(`| ${l.providerName} | ${l.host} | ${l.url}${status} |`);
      }
      return rows;
    };
    const lines = [`# CDN links for \`${title}\``, '', ...(result.root ? [] : [count, '']), '## Base URLs (append any file path)', '', ...table(result.base), ''];
    for (const file of files) lines.push(`## \`/${file.path}\``, '', ...table(file.links), '');
    return lines.join('\n');
  }

  const section = (heading, links) => {
    const out = ['', cyan(bold(heading))];
    let last;
    for (const l of links) {
      if (l.provider !== last) out.push(`  ${bold(l.providerName)}`);
      last = l.provider;
      out.push(`    ${l.url}${statusTag(l)}  ${dim(l.note)}`);
    }
    return out;
  };

  const lines = [bold(`CDN links for ${title}`) + (result.root ? '' : dim(`  (${count})`))];
  if (result.truncated) lines.push(red('Warning: GitHub truncated the file list (repo too large).'));
  lines.push(...section('Base URLs (append any file path)', result.base));
  for (const file of files) lines.push(...section(`/${file.path}`, file.links));
  return lines.join('\n');
}

function renderIp(ip, hosts, format) {
  if (format === 'json') return JSON.stringify({ ip, hosts }, null, 2);
  if (format === 'md') {
    const lines = [`# Wildcard DNS hostnames for \`${ip}\``, '', '| Provider | Format | Host | URL |', '| --- | --- | --- | --- |'];
    for (const h of hosts) {
      const status = h.ok === undefined ? '' : h.ok ? ' ✅' : ` ❌ ${h.error || h.resolved.join(', ')}`;
      lines.push(`| ${h.provider} | ${h.format} | ${h.host}${status} | ${h.url} |`);
    }
    return lines.join('\n');
  }
  const lines = [bold(`Wildcard DNS hostnames for ${ip}`)];
  let last;
  for (const h of hosts) {
    if (h.provider !== last) lines.push('', `  ${bold(h.provider)}`);
    last = h.provider;
    const tag = h.ok === undefined ? '' : h.ok ? green(' [ok]') : red(` [${h.error || h.resolved.join(', ') || 'fail'}]`);
    lines.push(`    ${h.url}${tag}  ${dim(h.format)}`);
  }
  return lines.join('\n');
}

function renderProviders() {
  const lines = [bold('1) CDN providers (GitHub repo -> CDN links)')];
  for (const p of cdnProviders) {
    lines.push(`  ${bold(p.id.padEnd(16))} ${dim(p.site)}`);
    for (const h of p.hosts) {
      lines.push(`    ${h.host.padEnd(28)} ${dim(h.note)}${h.unreliable ? red('  (--extra only)') : ''}`);
    }
  }
  lines.push('', bold('2) Wildcard DNS providers (IP -> hostnames)'));
  for (const p of wildcardProviders) {
    const formats = [...p.formats, ...(p.ipv6 ? ['ipv6'] : [])].join(', ');
    lines.push(`  ${bold(p.id.padEnd(16))} ${dim(p.site)}  formats: ${formats}`);
  }
  lines.push('', bold('3) Gens (upload a file -> links)'));
  lines.push(`  ${bold('uploadcare'.padEnd(16))} ${dim('https://uploadcare.com')}  --uploadcare, or: cdn-generator upload <file>`);
  lines.push(`  ${bold('c99'.padEnd(16))} ${dim('https://upload.c99.nl')}  --c99 (uploads to several reputable domains)`);
  return lines.join('\n');
}

const splitList = (list) => list?.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);

const uploadcareOptions = (values) =>
  values['uploadcare-key'] ? { publicKey: values['uploadcare-key'] } : {};

async function runRepo(input, values) {
  // A bare repo run does "everything" except wildcard DNS: CDN links + both uploads.
  // Passing --uploadcare or --c99 narrows it to just those; --no-upload turns uploads off.
  const explicitUpload = values.uploadcare || values.c99;
  const autoUpload = !explicitUpload && !values['no-upload'] && !values.root;
  const wantUploadcare = !values.root && (values.uploadcare || autoUpload);
  const wantC99 = !values.root && (values.c99 || autoUpload);

  if (process.stderr.isTTY) process.stderr.write(dim('Fetching repo info from GitHub...\n'));
  if (wantUploadcare || wantC99) process.stderr.write(dim('Uploading files (use --no-upload to skip)...\n'));
  const result = await generateRepoLinks(input, {
    ref: values.ref,
    pin: values.pin,
    all: values.root ? false : values.all,
    files: values.file,
    providers: splitList(values.provider),
    extra: values.extra,
    uploadcare: wantUploadcare ? uploadcareOptions(values) : false,
    c99: wantC99,
  });
  result.root = Boolean(values.root);
  if (result.uploadsSkipped) {
    process.stderr.write(
      red(
        `Skipped uploads: ${result.uploadsSkipped} files is over the ${MAX_UPLOADCARE_FILES}-file limit. ` +
          'Point at a single file or folder URL to upload, or use --no-upload.\n',
      ),
    );
  }
  if (values.check) {
    const groups = values.root ? [result.base] : result.files.map((f) => f.links);
    const flat = groups.flat();
    process.stderr.write(dim(`Checking ${flat.length} URLs...\n`));
    const checked = await checkUrls(flat);
    let i = 0;
    const refill = (links) => links.map(() => checked[i++]);
    if (values.root) result.base = refill(result.base);
    else for (const file of result.files) file.links = refill(file.links);
  }
  return result;
}

const looksLikeIp = (s) => isIP(String(s).replace(/^\[|\]$/g, '')) !== 0;

async function runIp(ip, values) {
  let hosts = wildcardHosts(ip, {
    sub: values.sub,
    port: values.port ? Number(values.port) : undefined,
    protocol: values.https ? 'https' : 'http',
    providers: splitList(values.provider),
  });
  if (values.check) {
    process.stderr.write(dim(`Resolving ${hosts.length} hostnames...\n`));
    hosts = await checkHosts(hosts, ip);
  }
  return hosts;
}

async function interactive(values, format) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(bold(`cdn-generator v${pkg.version}\n`));
    console.log(`  ${bold('1) CDN')}       GitHub repo -> CDN links (jsDelivr, esm.sh, GitHack, mirrors)`);
    console.log(`  ${bold('2) Wildcard')}  IP address -> wildcard DNS hostnames (nip.io, sslip.io, ...)`);
    console.log(`  ${bold('3) Gens')}      upload a file -> Uploadcare or c99 links\n`);
    const choice = (await rl.question('Choose 1, 2 or 3: ')).trim();

    if (choice === '1' || /^cdn$/i.test(choice)) {
      const input = (await rl.question('GitHub repo or URL: ')).trim();
      if (!input) throw new Error('Nothing entered');
      return { kind: 'repo', result: await runRepo(input, values) };
    }
    if (choice === '2' || /^wild/i.test(choice)) {
      const input = (await rl.question('IP address: ')).trim();
      if (!input) throw new Error('Nothing entered');
      return { kind: 'ip', ip: input, result: await runIp(input, values) };
    }
    if (choice === '3' || /^gen/i.test(choice)) {
      const svc = (await rl.question('Upload to (1) Uploadcare or (2) c99? ')).trim();
      const useC99 = svc === '2' || /c99/i.test(svc);
      const file = (await rl.question('File path or URL: ')).trim();
      if (!file) throw new Error('Nothing entered');
      return { kind: 'upload', text: await runUpload([file], { ...values, c99: useC99 }, format) };
    }
    throw new Error('Please choose 1, 2 or 3');
  } finally {
    rl.close();
  }
}

async function runUpload(inputs, values, format) {
  const service = values.c99 ? 'c99' : 'Uploadcare';
  const results = [];
  for (const input of inputs) {
    process.stderr.write(dim(`Uploading ${input} to ${service}...\n`));
    if (values.c99) {
      const { name, results: hosts } = await uploadToC99(input);
      results.push({ input, name, hosts });
    } else {
      results.push({ input, ...(await uploadToUploadcare(input, uploadcareOptions(values))) });
    }
  }
  if (format === 'json') return JSON.stringify(results.length === 1 ? results[0] : results, null, 2);
  if (format === 'md') {
    const rows = ['| File | URL |', '| --- | --- |'];
    for (const r of results) {
      if (r.hosts) for (const h of r.hosts.filter((x) => x.ok)) rows.push(`| ${r.name} (${h.domain}) | ${h.url} |`);
      else rows.push(`| ${r.name} | ${r.url} |`);
    }
    return rows.join('\n');
  }
  return results
    .map((r) => {
      if (r.hosts) {
        const ok = r.hosts.filter((h) => h.ok);
        const failed = r.hosts.filter((h) => !h.ok);
        const lines = [bold(r.name), ...ok.map((h) => `  ${h.url}  ${dim(h.domain)}`)];
        if (failed.length) lines.push(dim(`  (failed: ${failed.map((h) => h.domain).join(', ')})`));
        return lines.join('\n');
      }
      return `${bold(r.name)} ${dim(`(${r.mimeType}, ${r.size} bytes, uuid ${r.uuid})`)}\n  ${r.url}`;
    })
    .join('\n');
}

async function run(input, values) {
  if (looksLikeIp(input)) return { kind: 'ip', ip: input, result: await runIp(input, values) };
  return { kind: 'repo', result: await runRepo(input, values) };
}

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(pkg.version);

  const format = values.json ? 'json' : values.md ? 'md' : 'text';
  const [command, target, ...more] = positionals;
  const render = (r) =>
    r.kind === 'upload' ? r.text : r.kind === 'repo' ? renderRepo(r.result, format) : renderIp(r.ip, r.result, format);
  let output;

  if (!command) {
    if (!process.stdin.isTTY) return console.log(HELP);
    output = render(await interactive(values, format));
  } else if (command === 'providers' || command === 'list') {
    output = format === 'json' ? JSON.stringify({ cdnProviders, wildcardProviders }, null, 2) : renderProviders();
  } else if (['generate', 'gen', 'repo', 'gh', 'ip'].includes(command)) {
    if (!target) throw new Error(`Missing ${command === 'ip' ? 'IP' : 'GitHub URL'}. Run cdn-generator --help`);
    output = render(await run(target, values));
  } else if (command === 'upload') {
    if (!target) throw new Error('Missing file. Example: cdn-generator upload ./logo.svg');
    output = await runUpload([target, ...more], values, format);
  } else {
    output = render(await run(command, values));
  }

  if (values.out) {
    await writeFile(values.out, output.replace(/\x1b\[[0-9;]*m/g, '') + '\n');
    console.log(green(`Saved to ${values.out}`));
  } else {
    console.log(output);
  }
}

main().catch((err) => {
  console.error(red(`Error: ${err.message}`));
  process.exit(1);
});
