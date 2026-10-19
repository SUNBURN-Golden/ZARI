// Bot job → result. The extension never chooses a URL: it only executes what
// the bot sends, and only inside the allowlist. Chrome-specific work (opening
// the tab, injecting the collector) is passed in as `env`, so this logic runs
// unchanged under test with a fake environment.
import { SITES, isVisitable, normalizeUrl, parseHttpsUrl, productKey, siteOfHost } from './sites.js';
import { detectBlocked } from './blocked.js';
import { extractListing, extractProducts } from './extract.js';

const KINDS = new Set(['robots', 'listing', 'product']);

/**
 * @param {{id:string,kind:string,url:string}} job
 * @param {{ collect:(url:string, kind:string)=>Promise<any>, now:()=>number }} env
 */
export async function handleJob(job, env) {
  const id = typeof job?.id === 'string' ? job.id.slice(0, 64) : '';
  const fail = (code) => ({ type: 'error', id, code });
  if (!id || !KINDS.has(job.kind) || typeof job.url !== 'string') return fail('bad_job');
  const url = parseHttpsUrl(job.url);
  const site = url && siteOfHost(url.hostname);
  if (!url || !site) return fail('out_of_scope');

  if (job.kind === 'robots') {
    // robots.txt is per host (RFC 9309): each allowlisted host answers its
    // own, so a job may ask for it on any of them — store.ohou.se included.
    if (url.pathname !== '/robots.txt' || url.search) return fail('out_of_scope');
  } else {
    if (!isVisitable(job.url)) return fail('out_of_scope');
    if (job.kind === 'product' && !productKey(job.url)) return fail('out_of_scope');
  }

  let snapshot;
  try {
    snapshot = await env.collect(job.url, job.kind);
  } catch {
    return fail('navigation_failed');
  }
  const finalUrl = parseHttpsUrl(String(snapshot?.url ?? ''));
  if (!finalUrl || finalUrl.hostname !== url.hostname) return fail('out_of_scope');

  if (job.kind === 'robots') {
    if (snapshot.status === 429) return { type: 'blocked', id, reason: 'http_429', status: 429 };
    return {
      type: 'result', id, kind: 'robots', host: url.hostname,
      status: snapshot.status, contentType: String(snapshot.contentType ?? ''), text: String(snapshot.text ?? ''),
    };
  }
  if (!isVisitable(String(snapshot.url))) return fail('out_of_scope');
  const reason = detectBlocked(snapshot, finalUrl.pathname);
  if (reason) return { type: 'blocked', id, reason, status: snapshot.status ?? null };
  if (job.kind === 'listing') {
    return { type: 'result', id, kind: 'listing', url: normalizeUrl(job.url), links: extractListing(snapshot, String(snapshot.url)) };
  }
  const extracted = extractProducts(snapshot, String(snapshot.url), env.now());
  if (extracted.error) return fail(extracted.error);
  return { type: 'result', id, kind: 'product', url: normalizeUrl(job.url), items: extracted.items };
}

export { SITES };
