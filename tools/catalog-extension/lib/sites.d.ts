export type SiteKey = 'ohou' | '29cm' | 'ikea' | 'muji' | 'daiso';
export interface SiteConfig {
  key: SiteKey;
  hosts: string[];
  pathPrefix?: string;
  pathPrefixes?: string[];
  denyPrefixes: string[];
  product: RegExp[];
  blockedReason?: string;
}
export const SITES: Record<SiteKey, SiteConfig>;
export function parseHttpsUrl(raw: string): URL | null;
export function siteOfHost(host: string): SiteConfig | null;
export function normalizeUrl(raw: string): string | null;
export function productKey(raw: string): { site: SiteKey; productId: string } | null;
export function isVisitable(raw: string): boolean;

export function canonicalProductUrl(raw: string): string | null;
