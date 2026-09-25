/*
 * ZARI versioned same-origin app-shell cache (Ticket 009,
 * PERFORMANCE_SECURITY_FAILURES §2).
 *
 * Discipline: fetch the build manifest, stage every listed asset into a
 * per-build cache, promote atomically at a navigation boundary, and retain
 * the previous complete build for recovery. An incomplete stage never
 * replaces the prior build. Only manifest-listed same-origin static assets
 * are cached — never project data, photos, or third-party pages. There is
 * no background sync and no transmission of user data.
 */
const PREFIX = 'zari-build-';
const META = 'zari-shell-meta';
const MANIFEST = 'zari-build.json';

const urlFor = (path) => new URL(path, self.registration.scope).href;

async function readMeta(key) {
  const cache = await caches.open(META);
  const res = await cache.match(key);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
async function writeMeta(key, value) {
  const cache = await caches.open(META);
  await cache.put(
    key,
    new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}
async function deleteMeta(key) {
  const cache = await caches.open(META);
  await cache.delete(key);
}

function manifestOk(m) {
  return (
    m !== null &&
    typeof m === 'object' &&
    typeof m.buildId === 'string' &&
    m.buildId.length > 0 &&
    typeof m.builtAt === 'string' &&
    Array.isArray(m.assets) &&
    m.assets.every(
      (a) =>
        typeof a === 'string' &&
        a.length > 0 &&
        !a.startsWith('/') &&
        !a.includes('..') &&
        !a.includes('://'),
    )
  );
}

/** Fetch+stage a complete build; on any asset failure the stage is dropped. */
async function syncBuild() {
  const response = await fetch(MANIFEST, { cache: 'no-store' });
  if (!response.ok) return;
  const manifest = await response.json();
  if (!manifestOk(manifest)) return;
  const active = await readMeta('active.json');
  const staged = await readMeta('staged.json');
  if (active?.buildId === manifest.buildId || staged?.buildId === manifest.buildId)
    return;
  // Downgrade protection: never stage a build older than the active one.
  if (
    active &&
    typeof active.builtAt === 'string' &&
    manifest.builtAt <= active.builtAt
  )
    return;
  const name = PREFIX + manifest.buildId;
  const cache = await caches.open(name);
  try {
    await cache.addAll(
      manifest.assets.map((p) => new Request(urlFor(p), { cache: 'reload' })),
    );
    // `response` was consumed by .json() — store a fresh copy of the manifest.
    await cache.put(
      urlFor(MANIFEST),
      new Response(JSON.stringify(manifest), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  } catch {
    // An incomplete update retains the prior build — the partial cache goes.
    await caches.delete(name);
    return;
  }
  await writeMeta('staged.json', manifest);
  const clients = await self.clients.matchAll();
  for (const client of clients)
    client.postMessage({ type: 'buildStaged', buildId: manifest.buildId });
}

async function buildComplete(manifest) {
  const cache = await caches.open(PREFIX + manifest.buildId);
  for (const path of manifest.assets)
    if (!(await cache.match(urlFor(path)))) return false;
  return true;
}

/**
 * Atomic activation: a fully staged build is promoted only at a navigation
 * boundary (reload/new visit), never mid-session — in-flight saves and
 * searches finish on the build that started them.
 */
async function promoteIfReady() {
  const staged = await readMeta('staged.json');
  const active = await readMeta('active.json');
  if (!staged || staged.buildId === active?.buildId) return active;
  if (!(await buildComplete(staged))) return active;
  await writeMeta('previous.json', active);
  await writeMeta('active.json', staged);
  await deleteMeta('staged.json');
  await evictOldBuilds();
  return staged;
}

/** Keep the active and previous complete builds; drop anything older. */
async function evictOldBuilds() {
  const keep = new Set([META]);
  for (const key of ['active.json', 'previous.json', 'staged.json']) {
    const meta = await readMeta(key);
    if (meta?.buildId) keep.add(PREFIX + meta.buildId);
  }
  for (const name of await caches.keys())
    if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name);
}

async function serveFrom(manifest, url) {
  const cache = await caches.open(PREFIX + manifest.buildId);
  return (await cache.match(url)) ?? null;
}

async function onNavigate(request) {
  const sync = syncBuild().catch(() => undefined);
  const active = await promoteIfReady().catch(() => readMeta('active.json'));
  try {
    const response = await fetch(request);
    await sync;
    return response;
  } catch {
    const build = active ?? (await readMeta('active.json'));
    if (build) {
      const hit =
        (await serveFrom(build, urlFor('index.html'))) ??
        (await serveFrom(build, request.url));
      if (hit) return hit;
    }
    return new Response('offline', { status: 503 });
  }
}

async function onAsset(request) {
  const active = await readMeta('active.json');
  if (active) {
    const hit = await serveFrom(active, request.url);
    if (hit) return hit;
  }
  try {
    return await fetch(request);
  } catch {
    // Last resort: the retained previous build may still hold the asset.
    const previous = await readMeta('previous.json');
    if (previous) {
      const hit = await serveFrom(previous, request.url);
      if (hit) return hit;
    }
    return new Response('', { status: 504 });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => syncBuild().catch(() => undefined)));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'sync') event.waitUntil(syncBuild());
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only same-origin GET — cross-origin traffic is never intercepted or
  // cached, and non-GET traffic is never touched.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(onNavigate(request));
    return;
  }
  event.respondWith(onAsset(request));
});
