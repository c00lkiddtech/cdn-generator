import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cdnLinks, cdnProviders, wildcardHosts, ipForms, parseRepo } from '../src/index.js';

test('parseRepo handles common input styles', () => {
  assert.deepEqual(parseRepo('jquery/jquery'), { owner: 'jquery', repo: 'jquery', ref: undefined, path: '' });
  assert.deepEqual(parseRepo('jquery/jquery@3.7.1'), { owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: '' });
  assert.deepEqual(parseRepo('jquery/jquery#main'), { owner: 'jquery', repo: 'jquery', ref: 'main', path: '' });
  assert.deepEqual(parseRepo('https://github.com/jquery/jquery.git'), {
    owner: 'jquery', repo: 'jquery', ref: undefined, path: '',
  });
  assert.deepEqual(parseRepo('https://github.com/jquery/jquery/blob/3.7.1/dist/jquery.js#L10'), {
    owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.js',
  });
  assert.deepEqual(parseRepo('git@github.com:jquery/jquery.git'), {
    owner: 'jquery', repo: 'jquery', ref: undefined, path: '',
  });
  assert.deepEqual(parseRepo('https://github.com/a/b/blob/main/svg/my%20file.svg'), {
    owner: 'a', repo: 'b', ref: 'main', path: 'svg/my file.svg',
  });
  assert.throws(() => parseRepo('nope'));
});

test('cdnLinks covers every provider host', () => {
  const links = cdnLinks({ owner: 'jquery', repo: 'jquery', ref: '3.7.1', path: 'dist/jquery.min.js' });
  const hostCount = cdnProviders.reduce((n, p) => n + p.hosts.length, 0);
  assert.equal(links.length, hostCount);
  const byHost = Object.fromEntries(links.map((l) => [l.host, l.url]));
  assert.equal(byHost['cdn.jsdelivr.net'], 'https://cdn.jsdelivr.net/gh/jquery/jquery@3.7.1/dist/jquery.min.js');
  assert.equal(byHost['jsd-proxy.ygxz.in'], 'https://jsd-proxy.ygxz.in/gh/jquery/jquery@3.7.1/dist/jquery.min.js');
  assert.equal(byHost['esm.sh'], 'https://esm.sh/gh/jquery/jquery@3.7.1/dist/jquery.min.js');
  assert.equal(byHost['rawcdn.githack.com'], 'https://rawcdn.githack.com/jquery/jquery/3.7.1/dist/jquery.min.js');
  assert.equal(byHost['cdn.statically.io'], 'https://cdn.statically.io/gh/jquery/jquery@3.7.1/dist/jquery.min.js');
});

test('cdnLinks filters providers and encodes paths', () => {
  const links = cdnLinks({ owner: 'a', repo: 'b', ref: 'main', path: 'my file.js', providers: ['githack'] });
  assert.deepEqual(links.map((l) => l.url), [
    'https://raw.githack.com/a/b/main/my%20file.js',
    'https://rawcdn.githack.com/a/b/main/my%20file.js',
  ]);
  assert.throws(() => cdnLinks({ owner: 'a', repo: 'b', ref: 'main', providers: ['nope'] }), /Unknown provider/);
});

test('ipForms builds dot, dash and hex labels', () => {
  assert.deepEqual(ipForms('10.0.0.1'), { version: 4, dot: '10.0.0.1', dash: '10-0-0-1', hex: '0a000001' });
  assert.deepEqual(ipForms('[2a01:4f8:c17:b8f::2]'), { version: 6, dash: '2a01-4f8-c17-b8f--2' });
  assert.deepEqual(ipForms('::1'), { version: 6, dash: '0--1' });
  assert.throws(() => ipForms('999.1.1.1'));
});

test('wildcardHosts respects each provider format', () => {
  const hosts = wildcardHosts('10.0.0.1').map((h) => h.host);
  assert.ok(hosts.includes('10.0.0.1.nip.io'));
  assert.ok(hosts.includes('0a000001.sslip.io'));
  assert.ok(hosts.includes('10-0-0-1.anyip.dev'));
  assert.ok(!hosts.includes('10.0.0.1.anyip.dev'));
  assert.ok(!hosts.includes('0a000001.traefik.me'));
});

test('wildcardHosts adds subdomains and skips unsupported IPv6', () => {
  const sub = wildcardHosts('10.0.0.1', { sub: 'app', providers: ['backname.io'] }).map((h) => h.host);
  assert.deepEqual(sub, ['app.10.0.0.1.backname.io', 'app.10-0-0-1.backname.io']);

  const v6 = wildcardHosts('2a01:4f8:c17:b8f::2');
  assert.ok(!v6.some((h) => h.provider === 'local-ip.sh'));
  assert.ok(v6.every((h) => h.format === 'ipv6'));

  const withPort = wildcardHosts('10.0.0.1', { providers: ['nip.io'], port: 8080, protocol: 'https' });
  assert.equal(withPort[0].url, 'https://10.0.0.1.nip.io:8080');
  assert.throws(() => wildcardHosts('10.0.0.1', { sub: '-bad' }));
});
