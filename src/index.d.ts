export interface CdnHost {
  host: string;
  note: string;
}

export interface CdnProvider {
  id: string;
  name: string;
  site: string;
  hosts: CdnHost[];
  url(host: string, target: RepoTarget): string;
}

export interface RepoTarget {
  owner: string;
  repo: string;
  ref: string;
  path?: string;
}

export interface CdnLink {
  provider: string;
  providerName: string;
  host: string;
  note: string;
  path: string;
  url: string;
  status?: number;
  ok?: boolean;
  error?: string;
}

export interface WildcardProvider {
  id: string;
  site: string;
  formats: Array<'dot' | 'dash' | 'hex'>;
  ipv6: boolean;
  subSeparators: Array<'.' | '-'>;
}

export interface WildcardHost {
  provider: string;
  format: 'dot' | 'dash' | 'hex' | 'ipv6';
  host: string;
  url: string;
  resolved?: string[];
  ok?: boolean;
  error?: string;
}

export interface ParsedRepo {
  owner: string;
  repo: string;
  ref?: string;
  path: string;
}

export interface ResolvedRepo extends RepoTarget {
  path: string;
  originalRef: string;
}

export interface RepoLinksResult extends ResolvedRepo {
  truncated: boolean;
  base: CdnLink[];
  files: Array<{ path: string; links: CdnLink[] }>;
}

export const cdnProviders: CdnProvider[];
export const wildcardProviders: WildcardProvider[];

export function cdnLinks(options: RepoTarget & { providers?: string[] }): CdnLink[];

export function wildcardHosts(
  ip: string,
  options?: { sub?: string; providers?: string[]; port?: number; protocol?: 'http' | 'https' },
): WildcardHost[];

export function normalizeIp(ip: string): { ip: string; version: 4 | 6 };
export function ipForms(ip: string): { version: 4 | 6; dot?: string; dash: string; hex?: string };

export function parseRepo(input: string): ParsedRepo;
export function resolveRepo(
  repo: ParsedRepo,
  options?: { pin?: boolean; token?: string },
): Promise<ResolvedRepo>;
export function listFiles(
  repo: RepoTarget,
  options?: { token?: string },
): Promise<{ files: string[]; truncated: boolean; source: 'github' | 'jsdelivr' }>;
export function getDefaultBranch(owner: string, repo: string, options?: { token?: string }): Promise<string>;
export function getCommitSha(owner: string, repo: string, ref: string, options?: { token?: string }): Promise<string>;

export function generateRepoLinks(
  input: string,
  options?: {
    ref?: string;
    pin?: boolean;
    all?: boolean;
    files?: string[];
    providers?: string[];
    token?: string;
  },
): Promise<RepoLinksResult>;

export function checkUrls(
  links: CdnLink[],
  options?: { concurrency?: number; timeout?: number },
): Promise<CdnLink[]>;
export function checkHosts(
  hosts: WildcardHost[],
  ip: string,
  options?: { concurrency?: number },
): Promise<WildcardHost[]>;
