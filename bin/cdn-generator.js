#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import {
  cdnProviders,
  wildcardProviders,
  generateRepoLinks,
  wildcardHosts,
  checkUrls,
  checkHosts,
} from '../src/index.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `cdn-generator v${pkg.version}

Generate CDN links for a GitHub repo, or wildcard-DNS hostnames for an IP.

Usage:
  cdn-generator                         interactive mode
  cdn-generator repo <repo> [options]   GitHub repo -> CDN links
  cdn-generator ip <ip> [options]       IP -> wildcard DNS hostnames
  cdn-generator providers               list all supported services

<repo> can be: owner/repo, owner/repo@ref, https://github.com/owner/repo[/tree/<ref>/<path>]

Repo options:
  -r, --ref <ref>        branch, tag or commit (default: the repo's default branch)
  -f, --file <path>      link a specific file (repeatable)
  -a, --all              link every file in the repo (or in the path from the URL)
      --pin              resolve the ref to a commit SHA (best for production)

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
  pin: { type: 'boolean' },
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

  if (format === 'md') {
    const lines = [`# CDN links for \`${title}\``, ''];
    for (const file of result.files) {
      lines.push(`## \`/${file.path}\``, '', '| Provider | Host | URL |', '| --- | --- | --- |');
      for (const l of file.links) {
        const status = l.ok === undefined ? '' : l.ok ? ' ✅' : ` ❌ ${l.status || l.error}`;
        lines.push(`| ${l.providerName} | ${l.host} | ${l.url}${status} |`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  const lines = [bold(`CDN links for ${title}`)];
  if (result.truncated) lines.push(red('Warning: GitHub truncated the file list (repo too large).'));
  for (const file of result.files) {
    lines.push('', cyan(bold(`/${file.path}`)));
    let last;
    for (const l of file.links) {
      if (l.provider !== last) lines.push(`  ${bold(l.providerName)}`);
      last = l.provider;
      lines.push(`    ${l.url}${statusTag(l)}  ${dim(l.note)}`);
    }
  }
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
  const lines = [bold('CDN providers (repo mode)')];
  for (const p of cdnProviders) {
    lines.push(`  ${bold(p.id.padEnd(16))} ${dim(p.site)}`);
    for (const h of p.hosts) lines.push(`    ${h.host.padEnd(28)} ${dim(h.note)}`);
  }
  lines.push('', bold('Wildcard DNS providers (ip mode)'));
  for (const p of wildcardProviders) {
    const formats = [...p.formats, ...(p.ipv6 ? ['ipv6'] : [])].join(', ');
    lines.push(`  ${bold(p.id.padEnd(16))} ${dim(p.site)}  formats: ${formats}`);
  }
  return lines.join('\n');
}

const splitList = (list) => list?.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);

async function runRepo(input, values) {
  const result = await generateRepoLinks(input, {
    ref: values.ref,
    pin: values.pin,
    all: values.all,
    files: values.file,
    providers: splitList(values.provider),
  });
  if (values.check) {
    const flat = result.files.flatMap((f) => f.links);
    process.stderr.write(dim(`Checking ${flat.length} URLs...\n`));
    const checked = await checkUrls(flat);
    let i = 0;
    for (const file of result.files) file.links = file.links.map(() => checked[i++]);
  }
  return result;
}

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

async function interactive(values) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(bold(`cdn-generator v${pkg.version}\n`));
    console.log('  1) GitHub repo  -> CDN links (jsDelivr, esm.sh, GitHack, Statically, mirrors)');
    console.log('  2) IP address   -> wildcard DNS hostnames (nip.io, sslip.io, traefik.me, ...)\n');
    const choice = (await rl.question('Choose 1 or 2: ')).trim();

    if (choice === '1') {
      const repo = (await rl.question('GitHub repo (owner/repo or URL): ')).trim();
      const ref = (await rl.question('Branch/tag/commit (blank = default branch): ')).trim();
      const all = /^y/i.test((await rl.question('Generate links for every file? (y/N): ')).trim());
      const file = all ? '' : (await rl.question('File path (blank = repo root): ')).trim();
      const check = /^y/i.test((await rl.question('Check that the links work? (y/N): ')).trim());
      rl.close();
      const opts = { ...values, ref: ref || undefined, all, file: file ? [file] : undefined, check };
      return { kind: 'repo', result: await runRepo(repo, opts) };
    }
    if (choice === '2') {
      const ip = (await rl.question('IP address: ')).trim();
      const sub = (await rl.question('Subdomain prefix (blank = none): ')).trim();
      const check = /^y/i.test((await rl.question('Check DNS resolution? (y/N): ')).trim());
      rl.close();
      return { kind: 'ip', ip, result: await runIp(ip, { ...values, sub: sub || undefined, check }) };
    }
    throw new Error('Please choose 1 or 2');
  } finally {
    rl.close();
  }
}

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(pkg.version);

  const format = values.json ? 'json' : values.md ? 'md' : 'text';
  const [command, target] = positionals;
  let output;

  if (!command) {
    if (!process.stdin.isTTY) return console.log(HELP);
    const run = await interactive(values);
    output = run.kind === 'repo' ? renderRepo(run.result, format) : renderIp(run.ip, run.result, format);
  } else if (command === 'providers' || command === 'list') {
    output = format === 'json' ? JSON.stringify({ cdnProviders, wildcardProviders }, null, 2) : renderProviders();
  } else if (command === 'repo' || command === 'gh') {
    if (!target) throw new Error('Missing repo. Example: cdn-generator repo jquery/jquery@3.7.1');
    output = renderRepo(await runRepo(target, values), format);
  } else if (command === 'ip') {
    if (!target) throw new Error('Missing IP. Example: cdn-generator ip 192.168.1.10');
    output = renderIp(target, await runIp(target, values), format);
  } else {
    throw new Error(`Unknown command "${command}". Run cdn-generator --help`);
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
