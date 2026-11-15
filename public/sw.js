// 5.2 PWA service worker：離線殼層（cache-first）＋ CDN 執行期快取（stale-while-revalidate）。
// /api/* 與非 GET 請求完全不攔截（不呼叫 respondWith），因此絕不會進入任何快取。
// 版號由 tests/pwa.test.js 對照 APP_CONFIG.version；殼層檔案改動後須執行 npm run sync:sw 更新 SHELL_HASH。
const APP_VERSION = "V4.0";
const SHELL_HASH = "06807726cc5e";
const SHELL = `rfa-shell-${APP_VERSION}-${SHELL_HASH}`;
const CDN = `rfa-cdn-${APP_VERSION}`;

const PRECACHE = [
  "/icon.svg",
  "/index.html",
  "/js/analyzer.js",
  "/js/config.js",
  "/js/derive.js",
  "/js/mobile-shell.js?v=5.4.2",
  "/js/pose.js",
  "/js/pwa.js?v=5.2",
  "/js/renderer.js",
  "/js/report.js",
  "/js/state.js",
  "/js/ui.js",
  "/modules/bridge.js",
  "/modules/client/derive-request.js",
  "/modules/client/import-summary.js",
  "/modules/client/index.js",
  "/modules/landmarks/index.js",
  "/modules/landmarks/landmark-extract.js",
  "/modules/player/index.js",
  "/modules/player/keyframes.js",
  "/modules/player/kinematics.js",
  "/modules/player/stride-input.js",
  "/modules/profiles/baked-keyframes.js",
  "/modules/profiles/builtin.js",
  "/modules/profiles/index.js",
  "/modules/profiles/sim-capture.js",
  "/styles/main.css?v=5.4.2"
];

const CDN_PREFIXES = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/",
  "https://cdn.tailwindcss.com/",
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/",
];

self.addEventListener("install", (event) => {
  // 不呼叫 skipWaiting：新版須等使用者同意（SKIP_WAITING 訊息）。
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith("rfa-") && n !== SHELL && n !== CDN).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CDN);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response && (response.ok || response.type === "opaque")) {
      // 寫入失敗（如配額不足）不影響回應；納入 waitUntil 避免 SW 在寫入完成前被終止
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (request.headers.get("range")) return;

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")) {
      event.respondWith(
        caches.open(SHELL).then((cache) => cache.match("/index.html")).then((hit) => hit || fetch(request)),
      );
      return;
    }
    if (PRECACHE.includes(url.pathname + url.search)) {
      event.respondWith(
        caches
          .open(SHELL)
          .then((cache) => cache.match(url.pathname + url.search))
          .then((hit) => hit || fetch(request)),
      );
    }
    return;
  }

  if (CDN_PREFIXES.some((p) => request.url.startsWith(p))) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});
