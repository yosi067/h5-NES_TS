/*
 * H5-EMU 離線支援。
 *
 * 策略：
 * - 一般請求「網路優先」：有網路時行為與沒有 Service Worker 完全相同，只是順手存一份副本；
 *   離線或伺服器無回應時才改用副本。玩過的遊戲（ROM、核心、封面）因此可以離線再玩。
 * - Vite 產生、檔名含雜湊的 /assets/ 檔案內容不會變，採「快取優先」。
 * - 不處理跨網域、非 GET、Range 請求；不快取超過 96 MiB 的回應。
 */
const CACHE_NAME = 'h5emu-runtime-v1';
const MAX_CACHEABLE_BYTES = 96 * 1024 * 1024;
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const HASHED_ASSET = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|wasm|woff2?|png|svg|jpg|webp)$/;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('h5emu-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isCacheable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  const length = Number(response.headers.get('content-length') || '0');
  return !(length > MAX_CACHEABLE_BYTES);
}

async function putInCache(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // 空間不足等錯誤只影響離線副本，不影響遊戲。
  }
}

async function networkFirst(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    if (isCacheable(response)) event.waitUntil(putInCache(request, response.clone()));
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.match(SCOPE_PATH) || await caches.match(`${SCOPE_PATH}index.html`);
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirst(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheable(response)) event.waitUntil(putInCache(event.request, response.clone()));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('.map')) return;
  event.respondWith(HASHED_ASSET.test(url.pathname) ? cacheFirst(event) : networkFirst(event));
});
