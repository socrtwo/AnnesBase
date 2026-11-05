/* Filled from the complete production output by scripts/offline-build.ts. No user databases enter this cache. */
const VERSION = __OFFLINE_VERSION__;
const ASSETS = __OFFLINE_ASSETS__;
const SCOPE = self.registration.scope;
const PREFIX = `annesbase.shell.v1:${SCOPE}:`;
const CACHE = PREFIX + VERSION;
const urls = new Set(ASSETS.map(asset => new URL(asset.url, SCOPE).href));
const entry = new URL('index.html', SCOPE).href;

async function saveFiles(cleanupOnFailure) {
  const cache = await caches.open(CACHE);
  try {
    // Integrity rejects partial deployments, SPA fallbacks and mixed releases.
    for (const asset of ASSETS) {
      const request = new Request(new URL(asset.url, SCOPE), { integrity: asset.integrity, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      const response = await fetch(request);
      if (!response.ok) throw new Error('An offline asset could not be downloaded.');
      await cache.put(request, response);
    }
  } catch (error) { if (cleanupOnFailure) await caches.delete(CACHE); throw error; }
}
self.addEventListener('install', event => {
  // No skipWaiting: an update must never replace a running editor.
  event.waitUntil(saveFiles(true));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isEntry = request.mode === 'navigate' && url.origin === new URL(SCOPE).origin && [new URL(SCOPE).pathname, new URL(entry).pathname].includes(url.pathname);
  if (!isEntry && !urls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Whitelisted files only; no runtime caching of databases, APIs or external URLs.
    return await cache.match(isEntry ? entry : request) ?? fetch(request);
  })());
});
self.addEventListener('message', event => {
  if (!['ANNESBASE_OFFLINE_STATUS', 'ANNESBASE_REPAIR_OFFLINE'].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'ANNESBASE_REPAIR_OFFLINE') await saveFiles(false);
      const cache = await caches.open(CACHE);
      const ready = (await Promise.all([...urls].map(url => cache.match(url)))).every(Boolean);
      event.ports[0].postMessage({ type: 'ANNESBASE_OFFLINE_STATUS', ready, version: VERSION });
    } catch { event.ports[0].postMessage({ type: 'ANNESBASE_OFFLINE_STATUS', ready: false, version: VERSION }); }
  })());
});
