// The sole catalog network boundary. The build pins one public R2 origin;
// no user URL field, cookies, redirects, referrer or user data are sent.
import { parseBaseUrl, type RepositoryTransport } from './bundle';
export function configuredR2Base(raw: string | undefined): string | null {
  const base = raw ? parseBaseUrl(raw) : null;
  if (!base || base.port || !/^[a-z0-9-]+\.r2\.dev$/.test(base.hostname) || /%|\/\//.test(base.pathname)) return null;
  return base.toString();
}
export function r2Transport(baseUrl: string, http: typeof fetch = fetch): RepositoryTransport {
  const base = configuredR2Base(baseUrl);
  return async (request) => {
    if (!base) throw new Error('r2_not_configured');
    const url = new URL(request.url);
    const relative = request.url.startsWith(base) ? request.url.slice(base.length) : '';
    if (url.origin !== new URL(base).origin || !/^catalog\/v1\/(?:latest\.json|b-[a-f0-9]{16}\/bundle\.json)$/.test(relative) || request.method !== 'GET') throw new Error('r2_path_refused');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await http(request.url, { method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal });
      if (response.status !== 200) return { status: response.status, text: '' };
      const size = response.headers.get('content-length');
      if (size && (!/^\d+$/.test(size) || Number(size) > request.maxBytes)) throw new Error('r2_too_large');
      if (!response.body) throw new Error('r2_empty');
      const reader = response.body.getReader();
      let count = 0; const parts: Uint8Array[] = [];
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          count += chunk.value.byteLength;
          if (count > request.maxBytes) { await reader.cancel(); throw new Error('r2_too_large'); }
          parts.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(count); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return { status: 200, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch { throw new Error('r2_read_failed'); }
    finally { clearTimeout(timer); }
  };
}
