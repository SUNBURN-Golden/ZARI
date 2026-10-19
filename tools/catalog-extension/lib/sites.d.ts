export type SiteKey = 'ohou' | '29cm' | 'ikea';
export interface SiteConfig {
  key: SiteKey;
  hosts: string[];
  pathPrefix: string;
  denyPrefixes: string[];
  product: RegExp[];
}
export const SITES: Record<SiteKey, SiteConfig>;
export function parseHttpsUrl(raw: string): URL | null;
export function siteOfHost(host: string): SiteConfig | null;
export function normalizeUrl(raw: string): string | null;
export function productKey(raw: string): { site: SiteKey; productId: string } | null;
export function isVisitable(raw: string): boolean;
