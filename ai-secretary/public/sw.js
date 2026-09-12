/* 오프라인 캐시: 지하철에서 열었을 때 마지막으로 가져온 데이터를 보여준다.
   - 화면(HTML/정적자산): stale-while-revalidate
   - /api GET: network-first → 실패하면 캐시 (오프라인 표시는 클라이언트가 한다) */

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/today", "/manifest.json"]).catch(() => undefined)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) {
            const body = await cached.json().catch(() => null);
            return new Response(JSON.stringify({ ...(body ?? {}), _stale: true }), {
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: "오프라인이고 캐시도 없습니다.", _offline: true }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
