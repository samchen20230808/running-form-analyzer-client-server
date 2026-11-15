# Feature 5.2 — PWA（manifest、圖示、service worker 離線殼層、提示後更新）

## Status

`ready-for-dev`

## Epic

Epic 5 — PWA 與手機版 UI（編號 5.2；branch `feature-pwa`；前置 3.9（路徑已定為 `/index.html`）、Epic 4（HTTPS 部署）皆已完成）

## Objective

讓站台成為可安裝的 PWA：web app manifest、192／512／maskable 圖示、service worker 提供**離線殼層**（沒有網路也能開啟頁面與 UI），並在部署新版時**提示使用者後才更新**。

**已由使用者決定**：

1. MediaPipe CDN 資源採**執行期快取**：首次實際使用時才存，之後 stale-while-revalidate；**不在 SW 安裝時預載**。
2. 更新策略採**提示後更新**：偵測到新版 SW 時顯示提示，使用者按「重新整理」才 `skipWaiting()`＋重新載入；不自動切換。

**需求約束**（任務指定）：

- `/api/analyze`、`/api/derive` **絕不快取**（SW 不攔截，連 `respondWith` 都不呼叫）。
- 快取名稱含版號，並與 `APP_CONFIG.version` 同步，由 Vitest 把關。
- `scope`／`start_url` 依目前路徑（頁面在 `/index.html`，`/` 307 導向它）。
- `sw.js` 必須回 `Cache-Control: no-cache`。
- 不新增依賴；圖示產生方式需說明。

**行為不變**：`lib/**`（核心、player、landmarks、profiles、client）、`app/api/**`、存取控制、`RESPONSE_HEADERS`、`vercel.json`、`APP_CONFIG` 內容（本 Feature 不升版號）、`public/js/` 既有檔、`public/styles/main.css`、桌面與手機既有 UI（5.1／5.3／5.4／5.4.1／5.4.2）、baseline（walk 103／361ms／96）。

## 1. 目標與非目標

### 目標

1. Chromium（桌面與 Android）判定可安裝：`Page.getInstallabilityErrors` 為空；manifest 無錯誤。
2. 造訪過一次後離線重開 `/index.html`（或 `/`），頁面、樣式、全部本站 JS 與 `window.RFA` 正常載入；UI 可操作（切換分頁、⚙ 面板、Profile 選單）。
3. 曾在線上擷取過影片後，離線時 MediaPipe 仍能從快取載入並擷取；之後呼叫 API 失敗時沿用既有錯誤提示，不出現未處理例外。
4. `/api/*` 請求一律直接走網路，回應不出現在任何 Cache Storage 中。
5. 部署新殼層後，開著的頁面會出現「有新版本」提示；按「重新整理」切到新版，按「稍後」維持舊版直到下次開啟。
6. 既有 UI、API 行為、核心數值完全不變。

### 非目標

- 推播通知、背景同步、`navigator.storage.persist()`。
- 離線分析（評分、GCT、相位需 `/api/analyze`、`/api/derive`，本質上需要網路）。
- 預載（install 時下載）MediaPipe wasm／模型；自託管或釘版 CDN（另開 Feature，見 `docs/privacy.md` 第 8 節）。
- 頁面層級 CSP／安全標頭（另開 Feature，見 `docs/deployment.md`）。
- 自訂「安裝」按鈕（`beforeinstallprompt`）：依 Next 官方 PWA 指南建議不做，使用瀏覽器原生安裝 UI；iOS 以「分享 → 加入主畫面」。
- Workbox／Serwist 等套件（不新增依賴）；React 化；`APP_CONFIG` 升版。

## 2. 現況（讀碼）

| 項目 | 位置 | 現況 |
| ---- | ---- | ---- |
| 頁面 | `public/index.html` | 靜態 HTML（非 App Router 頁面），`app/layout.js` 的 `metadata` **不會**套用到它；`<head>` 需手動加 manifest／theme-color 標籤 |
| 根路徑 | `next.config.mjs` `redirects()` | `/` → `/index.html`（307，`permanent: false`）；`tests/legacy-client.test.js:301` 逐值比對，不可改 |
| 安全標頭 | `next.config.mjs` `headers()` | 只有 `source: "/api/:path*"` 一條（`no-store` 等 5 個），與 `lib/server/http-handler.js` `RESPONSE_HEADERS` 一致，由 `tests/api-analyze-route.test.js:290`、`tests/deploy-config.test.js:64` 以 `find(source === "/api/:path*")` 比對 → **新增別條規則不影響這兩個測試** |
| `vercel.json` | 根目錄 | 只有 `regions`；`tests/deploy-config.test.js:18` 禁止其含 `headers` 等鍵 → sw 標頭必須放 `next.config.mjs` |
| 存取控制 | `lib/server/access-control.js` | 只在 `/api/*` route handler 內呼叫；無 `middleware.js`／`proxy.js` → `/sw.js`、`/manifest.webmanifest`、`/icons/*` 不經存取控制，不會被 403／429 |
| 版本 | `lib/config.js`、`public/js/config.js` | 兩份 `APP_CONFIG.version`（目前 `"V4.0"`），一致性由 `tests/legacy-client.test.js:79` 把關 |
| 本站資源 | `index.html:10,62,1423–1431` | `/icon.svg`（來自 `app/icon.svg` 的 metadata route）、`styles/main.css?v=5.4.2`、`js/{config,state,ui,renderer,pose,derive,analyzer,report}.js`、`js/mobile-shell.js?v=5.4.2`、`modules/bridge.js`（ES module，再匯入 `modules/{player,landmarks,profiles,client}/**`） |
| 第三方 | `index.html:12–37`、`js/pose.js:36–39` | `cdn.tailwindcss.com`（無 `crossorigin` → opaque）、Google Fonts CSS（無 `crossorigin` → opaque）與 `fonts.gstatic.com` 字型（CORS）、`cdn.jsdelivr.net/npm/@mediapipe/{camera_utils,control_utils,drawing_utils,pose}`（`crossorigin="anonymous"` → CORS），以及 `locateFile` 於首次擷取時抓的 wasm／`.data`／`.binarypb`／`pose_landmark_heavy.tflite`（`modelComplexity: 2`，數十 MB）；皆**未釘版** |
| API 呼叫 | `js/analyzer.js:253`、`js/derive.js:55` | `fetch("/api/analyze")`、`fetch("/api/derive")`，皆 POST |
| 瀏覽器儲存禁用測試 | `tests/legacy-client.test.js:84` | `public/**/*.js` 與 `index.html` 禁止 `localStorage`／`sessionStorage`／`indexedDB`／`document.cookie`／`XMLHttpRequest`／`sendBeacon`／`WebSocket`／`EventSource`；**未禁** `caches` → SW 與註冊腳本須避開這些字樣 |
| 隱私文件 | `docs/privacy.md` 第 8、9 節 | 第 9 節宣稱不使用 cookie／localStorage／sessionStorage／IndexedDB；新增 Cache Storage 必須如實補寫 |
| Lint | `eslint.config.mjs` | 忽略 `public/js/**`、`public/modules/**`；`public/sw.js` **會被 lint** |
| Next 文件 | `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`、`.../01-metadata/manifest.md`、`.../public-folder.md`、`.../next-config-js/headers.md` | `app/manifest.js` 產生 `/manifest.webmanifest`（預設在 build 時靜態化）；`public/` 預設 `Cache-Control: public, max-age=0`；`headers()` 先於檔案系統套用，可覆寫 public 檔的 `Cache-Control`；官方範例 sw 標頭含 `default-src 'self'` CSP——**本專案不可照抄**（會擋掉 SW 對 CDN 的 fetch，見 D13） |

## 3. 決策表

| # | 議題 | 決定 | 理由／替代方案 |
| - | ---- | ---- | -------------- |
| D1 | manifest 形式 | `app/manifest.js`（JS，回傳物件），名稱與說明取自 `lib/config.js` 的 `APP_CONFIG`；`index.html` 手動加 `<link rel="manifest" href="/manifest.webmanifest">` | 名稱自動與 `APP_CONFIG` 同步；Next 原生支援、無新依賴。替代：`public/manifest.webmanifest` 靜態檔（需另寫同步測試） |
| D2 | SW 位置與 scope | `public/sw.js`，註冊 `register("/sw.js", { scope: "/", updateViaCache: "none" })` | 根目錄才能涵蓋 `/` 與 `/index.html`；不需 `Service-Worker-Allowed` |
| D3 | `start_url`／`scope`／`id` | `start_url: "/index.html"`、`scope: "/"`、`id: "/index.html"` | 避開 `/` 的 307（導覽回應帶 redirect 會讓安裝啟動多一跳，離線時也無法跟隨） |
| D4 | 殼層策略 | install 時預快取殼層清單（`PRECACHE`），之後 **cache-first**；導覽 `/`、`/index.html` 一律回快取的 `/index.html` | 同一版殼層的 HTML／CSS／JS 原子一致，搭配 D8 提示後更新；替代 network-first 會讓提示形同虛設且新 HTML＋舊 JS 可能錯配 |
| D5 | MediaPipe CDN | 執行期快取、stale-while-revalidate（**使用者決定**），範圍 `https://cdn.jsdelivr.net/npm/@mediapipe/` | 首次擷取時存；不預載數十 MB |
| D6 | Tailwind CDN、Google Fonts | 與 D5 同策略（執行期 SWR），存在同一個 CDN 快取 | 否則離線殼層沒有樣式、版面全壞；不預載（與 D5 一致）。代價：第一次造訪時 SW 尚未控制頁面，要第二次載入後才被存（見 7 節 C4） |
| D7 | `/api/*` | 不攔截：fetch handler 對 `pathname.startsWith("/api/")` 直接 `return`（不呼叫 `respondWith`）；非 GET 一律不攔截 | 「絕不快取」最強的保證是根本不經過 SW 的快取路徑；`/api` 既有 `Cache-Control: no-store` 不變 |
| D8 | 更新策略 | 提示後更新（**使用者決定**）：新 SW 停在 waiting → 頁面顯示提示 → 按「重新整理」才送 `SKIP_WAITING` → `controllerchange` 時 reload 一次 | 使用者可能有未匯出的分析結果，不可自動重載 |
| D9 | 快取名稱 | 殼層 `rfa-shell-${APP_VERSION}-${SHELL_HASH}`；CDN `rfa-cdn-${APP_VERSION}`；activate 時刪除 `rfa-` 開頭且不在這兩個名稱內的快取 | 名稱含版號（需求）；殼層另含內容雜湊，因本專案常在不升 `APP_CONFIG.version` 的情況下改殼層（如 5.4.x 只改 `?v=`）；CDN 快取只在發版時重建，避免每次小改都重下數十 MB |
| D10 | 版號與雜湊誰把關 | `sw.js` 頂端兩個字面常數 `APP_VERSION`、`SHELL_HASH`；新測試檔 `tests/pwa.test.js` 斷言 `APP_VERSION === APP_CONFIG.version`、`SHELL_HASH` 等於依殼層檔案內容重算的值；新增 `npm run sync:sw` 改寫 `SHELL_HASH` | 沿用既有「`public/js/config.js` 版號由測試把關」模式；改了任何殼層檔卻沒更新 sw → 測試失敗並提示執行 `npm run sync:sw`，確保 SW 位元組改變、使用者收到更新提示 |
| D11 | 註冊條件 | `"serviceWorker" in navigator && isSecureContext`；在 `localhost`／`127.0.0.1` 需網址帶 `?sw=1` 才註冊；`?sw=0` 會解除註冊並刪 `rfa-` 快取 | 避免開發時 cache-first 殼層讓改動看不到；Playwright 驗證用 `?sw=1` |
| D12 | 圖示 | `public/icons/icon-192.png`、`icon-512.png`（purpose `any`，由 `app/icon.svg` 放大）、`icon-maskable-512.png`（purpose `maskable`，新 SVG 來源滿版底色＋圖案縮至安全區）、`apple-touch-icon.png`（180，用 maskable 來源）；以系統內建 headless Edge／Chrome 一次性產生並提交 PNG（第 5.2 節） | 不新增 npm 依賴；iOS 主畫面不讀 manifest 圖示，需 `apple-touch-icon` |
| D13 | `sw.js` 標頭 | `next.config.mjs` `headers()` 新增 `source: "/sw.js"`：`Cache-Control: no-cache`、`Content-Type: application/javascript; charset=utf-8`、`X-Content-Type-Options: nosniff`；**不加 CSP** | `no-cache`（需求）讓瀏覽器每次更新檢查都回源；SW 的 CSP 會管 SW 自己的 fetch，官方範例的 `default-src 'self'` 會擋掉 D5／D6，CSP 留給頁面安全標頭 Feature 一併設計 |
| D14 | 更新提示 UI | `index.html` 新增 `#swUpdateToast`（預設 `hidden`，Tailwind class、固定在底部置中、`z-[70]`、`print:hidden`、`role="status"`），不改 `main.css` | 不動 5.1／5.3／5.4 區段與其雜湊測試；`z-[70]` 高於 ⚙ 面板（60）與 Logo（41） |
| D15 | `clients.claim()`／`skipWaiting()` | activate 時 `clients.claim()`；`skipWaiting()` **只**在收到 `{ type: "SKIP_WAITING" }` 時呼叫；install 不呼叫 | 首次安裝立即控制頁面，讓第一次擷取的 MediaPipe 檔就被執行期快取；更新仍須使用者同意 |
| D16 | lint | `public/sw.js` 接受 lint；若 `eslint-config-next` 對 SW 全域（`self`、`clients`、`caches`）報錯，於 `eslint.config.mjs` 的 `globalIgnores` 加 `"public/sw.js"` 並附中文註解（同 `public/js/**` 理由） | 不新增 `globals` 依賴 |

## 4. 範圍（檔案清單）

```
app/manifest.js                   # 新：manifest（D1、5.1 節）
public/sw.js                      # 新：service worker（D2、D4–D9、D15）
public/js/pwa.js                  # 新：註冊、更新偵測、提示 UI 控制（D8、D11）
public/icons/icon-192.png         # 新（D12）
public/icons/icon-512.png         # 新
public/icons/icon-maskable-512.png# 新
public/icons/apple-touch-icon.png # 新（180×180）
scripts/pwa-icons/icon-maskable.svg # 新：maskable 來源（滿版底色、安全區內圖案）；產生指令寫在本規格 5.2 節與 docs/deployment.md
scripts/sw-shell-lib.mjs          # 新：PRECACHE 期望清單與 SHELL_HASH 計算（測試與 sync 共用，仿 bake-profiles-lib.mjs）
scripts/sync-sw.mjs               # 新：改寫 public/sw.js 的 SHELL_HASH 行
public/index.html                 # <head> 加 manifest／theme-color／apple-touch-icon／apple-mobile-web-app-title；
                                  # body 尾加 #swUpdateToast 與 <script src="js/pwa.js?v=5.2"></script>（mobile-shell.js 之後）
next.config.mjs                   # headers() 新增 /sw.js 規則（D13）；/api 規則與 redirects 不動
package.json                      # scripts 加 "sync:sw": "node scripts/sync-sw.mjs"（不加依賴）
eslint.config.mjs                 # 僅在 D16 需要時
tests/pwa.test.js                 # 新：第 6 節 Q1–Q9
scripts/smoke-test.mjs            # 選做：加 /sw.js 標頭與 /manifest.webmanifest 檢查（若做，須同步 tests/deploy-config.test.js 的 fakeFetch）
docs/privacy.md                   # 第 9 節補 Cache Storage；第 8 節補 SW 背景重新驗證
docs/deployment.md                # PWA 段落：圖示產生、sync:sw、部署後檢查、實機待驗
README.md                         # 目前狀態加 5.2
docs/planning/epics-and-features.md # 5.2 列 planned → done（complete 時）
context/current-feature.md        # Notes
```

不改：`lib/**`、`app/api/**`、`app/layout.js`、`public/js/` 既有檔、`public/modules/**`、`public/styles/main.css`、`vercel.json`、`lib/config.js`、`public/js/config.js`。

## 5. 設計

### 5.1 manifest（`app/manifest.js`）

```js
import { APP_CONFIG } from "../lib/config.js";
export default function manifest() {
  return {
    id: "/index.html",
    name: APP_CONFIG.systemName,
    short_name: "跑姿分析",
    description: APP_CONFIG.subtitle,
    lang: "zh-TW",
    start_url: "/index.html",
    scope: "/",
    display: "standalone",
    background_color: "#0B0F19",
    theme_color: "#0B0F19",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- 不設 `orientation`（使用者會橫拍／橫看）。色碼取自 `index.html` Tailwind 設定 `bgPrimary`。
- 不得使用 Request-time API，保持 build 時靜態化。
- `index.html` `<head>`（`<link rel="icon">` 之後）新增：
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<meta name="theme-color" content="#0B0F19" />`
  - `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`
  - `<meta name="apple-mobile-web-app-title" content="跑姿分析" />`
- viewport meta 不動（W1 測試）。

### 5.2 圖示產生（不新增依賴）

1. **any（192／512）**：直接以 `app/icon.svg` 為來源（128 viewBox、深色圓角方形、四周 4px 透明）。
2. **maskable（512）與 apple-touch-icon（180）**：新增 `scripts/pwa-icons/icon-maskable.svg`：同 viewBox 128，`<rect width="128" height="128" fill="#131B2E"/>` 滿版（無圓角），圖案（頭、手臂、軀幹腿三段，同 `app/icon.svg`）包在 `<g transform="translate(12.8 12.8) scale(0.8)">`。驗算：圖案原範圍 x 28–94、y 19–108，縮放後最遠點距中心約 46 < 安全區半徑 51.2（0.4 × 128）。
3. **轉 PNG**：用 Windows 內建 Edge（或 Chrome）headless，對一個只含 `<img>` 的暫存 HTML（放 scratchpad，不提交；`body{margin:0;background:transparent}`、`img{width:Npx;height:Npx;display:block}`）截圖：

   ```
   msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 ^
     --default-background-color=00000000 --window-size=512,512 ^
     --screenshot=public\icons\icon-512.png file:///<scratchpad>/icon-512.html
   ```

   192、180 同法改尺寸。maskable／apple-touch-icon 來源不透明，可不帶透明背景參數。
   替代（同樣無依賴）：Playwright `page.setViewportSize({ width: N, height: N })` 後 `page.screenshot({ path, omitBackground: true })`。
4. 產出的 PNG 提交到 `public/icons/`；Q6 測試讀 PNG IHDR 驗尺寸。日後改 logo：改 `app/icon.svg` 與 `icon-maskable.svg` 後重跑本節。實作時把實際使用的指令記入 Notes 與 `docs/deployment.md`。

### 5.3 快取策略表（`public/sw.js` fetch handler，依序判斷）

| 順序 | 條件 | 處理 | 快取 |
| ---- | ---- | ---- | ---- |
| 1 | `request.method !== "GET"` | 不攔截（不呼叫 `respondWith`） | 無 |
| 2 | 同源且 `pathname.startsWith("/api/")` | 不攔截 | **無（絕不）** |
| 3 | 帶 `range` 標頭，或 URL 非 `http(s)` | 不攔截 | 無 |
| 4 | `request.mode === "navigate"` 且同源 `pathname` 為 `/` 或 `/index.html`（忽略 query） | 先 `shell.match("/index.html")`；miss 才 `fetch(request)` | 殼層（install 時已存） |
| 5 | 同源且 `pathname + search` 在 `PRECACHE` | cache-first；miss 時 `fetch` 回傳（不補存） | 殼層 |
| 6 | 其他同源（`/sw.js`、`/manifest.webmanifest`、`/icons/*`、`/_next/*` 等） | 不攔截 | 無 |
| 7 | `https://cdn.jsdelivr.net/npm/@mediapipe/`、`https://cdn.tailwindcss.com/`、`https://fonts.googleapis.com/`、`https://fonts.gstatic.com/` 開頭 | stale-while-revalidate：有快取先回，同時 `event.waitUntil` 背景 `fetch` 更新；無快取則 `fetch`，`response.ok \|\| response.type === "opaque"` 才 `put` 複本；網路失敗且無快取 → 讓錯誤照常傳回頁面（行為同今日離線） | CDN |
| 8 | 其他跨源 | 不攔截 | 無 |

`PRECACHE`（以 `index.html` 實際引用的字串為準，含 query）：

```
/index.html
/icon.svg
/styles/main.css?v=5.4.2
/js/config.js  /js/state.js  /js/ui.js  /js/renderer.js  /js/pose.js
/js/derive.js  /js/analyzer.js  /js/report.js  /js/mobile-shell.js?v=5.4.2  /js/pwa.js?v=5.2
/modules/bridge.js 及 public/modules/** 下所有 .js（player、landmarks、profiles、client）
```

- install：`caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: "reload" }))))`，任一失敗則安裝失敗（舊 SW 繼續服務）。不 `skipWaiting()`。
- activate：刪除 `rfa-` 開頭且 ≠ `SHELL`、≠ `CDN` 的快取；`clients.claim()`。
- message：`event.data?.type === "SKIP_WAITING"` → `self.skipWaiting()`；其他訊息忽略。
- 不使用 `localStorage` 等被禁字樣；不 `console.*`；不 `importScripts`。

### 5.4 `SHELL_HASH` 計算（`scripts/sw-shell-lib.mjs`）

- `expectedPrecache()`：解析 `public/index.html` 中同源的 `src="…"`／`href="…"`（排除 `http(s)://`、`/manifest.webmanifest`、`/icons/`），正規化為以 `/` 開頭，加上 `/index.html` 與 `public/modules/**/*.js`，排序。
- `computeShellHash(list)`：對每個項目去掉 query 後對應到檔案（`/icon.svg` → `app/icon.svg`，其餘 → `public/…`），依序把 `路徑\n` 與內容（CRLF → LF）餵給 `node:crypto` sha256，取前 12 個 hex。
- `scripts/sync-sw.mjs`：以正規表示式改寫 `public/sw.js` 中 `const SHELL_HASH = "…";` 一行，並檢查 `PRECACHE` 陣列與 `expectedPrecache()` 一致（不一致時印出差異並以非 0 結束，不自動改陣列）。
- 雜湊只作版本識別，不作完整性驗證。

### 5.5 註冊與更新流程（`public/js/pwa.js`）

```
window load
 └ 不支援 SW 或非安全情境 → 結束
 └ localhost／127.0.0.1：
     ?sw=0 → getRegistrations() 全部 unregister、刪 rfa- 快取 → 結束
     無 ?sw=1 → 結束
 └ register("/sw.js", { scope: "/", updateViaCache: "none" })
     ├ reg.waiting 且 navigator.serviceWorker.controller → 顯示提示
     ├ updatefound → newWorker statechange === "installed" 且 controller 存在 → 顯示提示
     │   （無 controller ＝ 首次安裝，不提示）
     └ visibilitychange 轉為 visible 且距上次檢查 ≥ 60 分鐘 → reg.update()
提示 #swUpdateToast：「有新版本可用。重新整理會清除目前畫面上的分析結果，需要的話請先匯出 JSON。」
 ├ [重新整理] → accepted = true；reg.waiting.postMessage({ type: "SKIP_WAITING" })
 │      controllerchange → 若 accepted 且尚未重載 → location.reload()（只一次）
 └ [稍後] → 隱藏提示（本頁不再顯示；新 SW 維持 waiting，所有分頁關閉後自然生效，或下次開啟再提示）
```

- `controllerchange` 在首次安裝的 `clients.claim()` 也會觸發，**必須**以 `accepted` 旗標防止誤重載。
- 註冊失敗靜默略過（不 `console.error`，避免離線／隱私模式產生 console error），頁面照常運作。
- 腳本為一般 script（非 module）、IIFE、不新增全域名稱；不依賴其他 `js/*.js` 載入順序。
- 提示按鈕觸控目標 ≥ 44px、字級 ≥ 16px（延續 5.1）；手機寬度下左右各留 16px。

### 5.6 `next.config.mjs`

`headers()` 陣列在既有 `/api/:path*` 之後追加：

```js
{
  source: "/sw.js",
  headers: [
    { key: "Cache-Control", value: "no-cache" },
    { key: "Content-Type", value: "application/javascript; charset=utf-8" },
    { key: "X-Content-Type-Options", value: "nosniff" },
  ],
},
```

`redirects()`、`/api` 規則、`poweredByHeader` 不動。

## 6. 測試計畫

**既有測試**：全部照舊通過；`REQUIRE_BASELINE=1 npm test` 基準 103／361ms／96 不變。特別注意 `tests/legacy-client.test.js` 的「不使用瀏覽器儲存」（會掃到 `sw.js`、`pwa.js`）、W1 viewport、5.3／5.4 的 id 唯一與 class 不變檢查。

**新增 `tests/pwa.test.js`**

1. **Q1 版號**：`public/sw.js` 的 `APP_VERSION` 字面值 `=== APP_CONFIG.version`；快取名稱模板含 `APP_VERSION`（`rfa-shell-${APP_VERSION}-${SHELL_HASH}`、`rfa-cdn-${APP_VERSION}`）。
2. **Q2 預快取清單**：`sw.js` 的 `PRECACHE` 與 `expectedPrecache()` 完全相同；每項對應檔案存在；不含 `/api/`。
3. **Q3 殼層雜湊**：`SHELL_HASH === computeShellHash(PRECACHE)`；失敗訊息含「請執行 npm run sync:sw」。
4. **Q4 fetch 行為**（不用 `node:vm`）：以 `new Function("self", "caches", "fetch", src)` 執行 `sw.js`，注入假 `self`（收集 `addEventListener`）、假 `caches`、假 `fetch`；派送假 fetch event 驗證：`POST /api/analyze`、`GET /api/derive`、`POST /index.html` 都**未**呼叫 `respondWith`；導覽 `/` 與 `/index.html?sw=1` 回殼層 `/index.html`；`/js/ui.js` cache-first；MediaPipe URL 走 SWR 並 `put` 到 `rfa-cdn-…`；任何情境下 `put` 的 URL 都不含 `/api/`。
5. **Q5 更新與生命週期**：`install` 不呼叫 `skipWaiting`；`message {type:"SKIP_WAITING"}` 才呼叫；`activate` 刪除舊 `rfa-` 快取、保留非 `rfa-` 快取、呼叫 `clients.claim`。
6. **Q6 manifest 與圖示**：`import("../app/manifest.js")` 的回傳值 `start_url === "/index.html"`、`scope === "/"`、`display === "standalone"`、`name === APP_CONFIG.systemName`；三個圖示 `src` 對應 `public/` 檔案存在，PNG IHDR 寬高與 `sizes` 相符；有 `purpose: "maskable"`；`apple-touch-icon.png` 為 180×180。
7. **Q7 標頭**：`nextConfig.headers()` 有 `source: "/sw.js"` 且 `Cache-Control` 為 `no-cache`；`/api/:path*` 規則仍為原 5 個（既有測試已涵蓋，此處只確認規則數為 2）。
8. **Q8 頁面掛鉤**：`index.html` 含 `rel="manifest" href="/manifest.webmanifest"`、`name="theme-color"`、`rel="apple-touch-icon"` 各一次；`js/pwa.js?v=5.2` 恰一次且在 `mobile-shell.js` 之後；`#swUpdateToast` 恰一次且 class 含 `hidden`。`pwa.js` 含 `updateViaCache`、`SKIP_WAITING`、`controllerchange`，不含 `skipWaiting(`（只有 SW 能呼叫）。
9. **Q9 隱私文件**：`docs/privacy.md` 含 `Cache Storage` 與「`/api` 回應不快取」的敘述字串（粗略包含即可，仿 `privacy-docs.test.js`）。
10. 故意改錯各一次再還原：改 `sw.js` 的 `APP_VERSION`（Q1 失敗）、改 `public/js/ui.js` 一個字元不跑 sync（Q3 失敗）、把 `/api/` 判斷拿掉（Q4 失敗）。

## 7. Playwright 驗證

SW 相關一律在 `npm run build && npm run start`（production）下測，網址帶 `?sw=1`；另以 `npm run dev` 確認開發模式不受影響。Chromium；`browser_run_code_unsafe` 取得 `context`／CDP session。

| # | 情境 | 期望 |
| - | ---- | ---- |
| C1 | `curl -I` `/sw.js`、`/manifest.webmanifest`、`/icons/*.png`、`/api/analyze`（GET） | sw：200、`Cache-Control: no-cache`、JS content-type；manifest：200、`application/manifest+json`；圖示 200；`/api/analyze` GET 仍 405 且帶原 5 個標頭（`no-store`） |
| C2 | 首次載入 `/index.html?sw=1` | `navigator.serviceWorker.ready` 解析、`registration.scope` 為 `http://localhost:3000/`；`caches.keys()` 含 `rfa-shell-V4.0-<hash>`，其內容 = `PRECACHE`；**不顯示**更新提示；console 0 error |
| C3 | 可安裝性 | CDP `Page.getInstallabilityErrors` 回傳空陣列；`Page.getAppManifest` 無 errors；manifest 圖示可下載 |
| C4 | 第二次載入（已受控） | 本站資源 `response.fromServiceWorker()` 為 true；Tailwind／Fonts／MediaPipe script 進入 `rfa-cdn-V4.0` |
| C5 | 離線殼層 | `context.setOffline(true)` 後重新載入 `/index.html?sw=1` 與 `/?sw=1`：頁面標題正確、`main.css` 規則生效、Tailwind 樣式在、`window.RFA` 已定義；手機 390×844（觸控模擬）三區殼層正常、分頁切換與 ⚙ 面板可用；桌面 1440 版面正常；console error 只允許第三方未快取資源的 `net::ERR_INTERNET_DISCONNECTED`（逐條列入 Notes），本站資源 0 錯誤 |
| C6 | API 不快取 | 線上載入影片擷取（或預覽＋匯入 walk JSON）：`POST /api/analyze`、`/api/derive` 200，回應 `fromServiceWorker()` 為 false；遍歷所有 `caches` 的 `keys()`，沒有任何 URL 含 `/api/`；匯入 walk JSON 步頻 103 |
| C7 | 離線使用 MediaPipe | 在 C6 線上擷取過一次後離線：再選影片，MediaPipe 由快取載入並擷取；`/api/analyze` 失敗時顯示既有錯誤提示，無未處理例外 |
| C8 | 更新提示 | 在 `public/js/ui.js` 末尾暫加一行註解、`npm run sync:sw`、重新 build＋start（測完還原並再 sync）；已開頁面 `reg.update()` 後出現 `#swUpdateToast`；按「稍後」→ 隱藏、舊 SW 仍為 active；重開頁面再出現；按「重新整理」→ 恰好 reload 一次、新快取名稱生效、舊 `rfa-shell-*` 被刪、`rfa-cdn-V4.0` 保留 |
| C9 | 開發模式 | `npm run dev` 開 `/index.html`（不帶參數）：無註冊、無 console error；`?sw=0` 會解除既有註冊 |
| C10 | 回歸 | 手機 412×737／390×844／360×740（觸控模擬）與 1440、768：版面、Logo 固定、常駐區、核心二地板穩定與 5.4.2 完成時一致；切換 Profile、播放骨架動畫、選擇／拖入影片、匯出報告可用；本站資源無 4xx；console 0 error（C5 離線例外除外） |

截圖存 scratchpad `52/`（離線殼層手機與桌面、更新提示手機與桌面）。

## 8. 實作步驟

1. 開 branch `feature-pwa`；重讀第 2 節列出的 Next 文件確認無變更。
2. 產生圖示（5.2 節），提交 `public/icons/*` 與 `scripts/pwa-icons/icon-maskable.svg`。
3. `app/manifest.js`；`index.html` `<head>` 標籤。
4. `scripts/sw-shell-lib.mjs`、`public/sw.js`、`scripts/sync-sw.mjs`、`package.json` script；`npm run sync:sw`。
5. `public/js/pwa.js`、`#swUpdateToast`、script 標籤；再跑 `npm run sync:sw`（`index.html` 與 `pwa.js` 都在殼層內）。
6. `next.config.mjs` 標頭；必要時 D16。
7. `tests/pwa.test.js`、故意改錯；build、lint、`REQUIRE_BASELINE=1 npm test`。
8. 第 7 節 Playwright；文件同步（第 9 節）；Notes。

## 9. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/privacy.md` | 第 9 節：使用 Cache Storage 只存本站靜態殼層與第三方 CDN 檔（Tailwind、字型、MediaPipe 程式與模型），**不存影片、landmarks、匯入的 JSON 或任何 `/api` 回應**；清除方式（瀏覽器網站資料、`?sw=0` 僅限 localhost）；第 8 節：SW 背景重新驗證會在使用時向同一批 CDN 發請求，不新增第三方 |
| `docs/deployment.md` | PWA 段落：`sync:sw` 與 Q3 的關係（改殼層檔就要跑）、圖示產生指令、部署後 `curl -I /sw.js` 檢查、更新提示的預期行為、第 11 節實機清單連結 |
| `README.md` | 「目前狀態」加 5.2；`npm run sync:sw` |
| `docs/planning/epics-and-features.md` | 5.2 列說明更新為實際決定（執行期 SWR、提示後更新、快取名稱含版號＋殼層雜湊、`/api` 不攔截），complete 時改 `done` |
| `context/current-feature.md` | Notes（驗證結果、圖示產生指令、C5 允許的 console 例外） |

## 10. 驗收標準

1. `npm run build`、`npm run lint` 通過。
2. `REQUIRE_BASELINE=1 npm test` 全過、基準 103／361ms／96 不變；Q1–Q9 通過，故意改錯會失敗並已還原。
3. C1–C10 通過，結果與截圖路徑寫入 Notes。
4. `git diff main -- lib app/api app/layout.js public/js/config.js public/js/state.js public/js/ui.js public/js/renderer.js public/js/pose.js public/js/derive.js public/js/analyzer.js public/js/report.js public/js/mobile-shell.js public/modules public/styles vercel.json` 為空；`index.html` diff 只有新增行（無既有 class／id 修改）。
5. 無新依賴（`package.json` 的 `dependencies`／`devDependencies` 不變）。
6. 文件依第 9 節更新。

## 11. 實機待驗清單（HTTPS 部署後，由使用者操作）

部署（`vercel deploy` 等）由使用者執行；agent 只提供清單。結果回報後記入 Notes。

**Android（Chrome、Samsung Internet）**

1. 網址列或選單出現「安裝應用程式」；安裝後主畫面圖示為 maskable（圖案完整、不被裁、底色滿版）。
2. 從主畫面開啟：standalone（無網址列）、啟動畫面底色 `#0B0F19`、落在 `/index.html`。
3. standalone 下 5.4／5.4.2 一屏版面（`--chrome-h`、Logo 固定、核心二地板）正常；狀態列顏色合理。
4. 選擇影片、拍攝影片（`capture`）、擷取、`/api/analyze` 成功；匯出 JSON 下載、匯出報告列印／另存 PDF 可用。
5. 線上擷取一次後開飛航模式，從主畫面開啟：殼層與樣式正常；再擷取一次 MediaPipe 可運作，分析時出現網路錯誤提示。
6. 使用者重新部署有殼層變更的版本後再開 App：出現「有新版本」提示；「稍後」不重載；「重新整理」重載一次並看到新版。

**iOS（Safari 16.4+）**

7. 分享 → 加入主畫面：圖示為 `apple-touch-icon`、名稱「跑姿分析」。
8. 主畫面開啟為 standalone；safe-area（瀏海、Home 指示條）不蓋住 Logo 與更新提示。
9. standalone 下檔案選擇、拍攝、匯出報告（`print`）是否可用（iOS standalone 對列印與下載有限制，若不可用記錄為已知限制）。
10. 離線開啟（同第 5 點）；注意 iOS 可能在久未使用後清除 Cache Storage，屬平台限制。
11. 更新提示（同第 6 點）。

**桌面（Chrome／Edge）**

12. 網址列安裝圖示可安裝；獨立視窗開啟，桌面版面與瀏覽器分頁中一致。

## 12. 風險與已知限制

- **CDN 未釘版＋SWR**：上游更新時，`pose.js` 與 wasm／模型可能在不同次載入分別被背景更新，短暫出現新舊混用；根治需釘版或自託管（另開 Feature）。快取內容會在發版（`APP_CONFIG.version` 變更）時整批重建。
- **第一次造訪不存 CDN**：SW 安裝前已發出的 Tailwind／字型／MediaPipe script 請求不經 SW；需第二次載入或首次擷取（`clients.claim()` 後）才進快取。只造訪過一次就離線，殼層會沒有 Tailwind 樣式。
- **opaque 回應**：Tailwind 與 Fonts CSS 為 opaque，無法判斷是否為錯誤頁；Chrome 對 opaque 項目以每筆約數 MB 計算配額。總量（含 heavy 模型）約數十 MB，低儲存裝置可能被清除。
- **提示後更新**：使用者一直按「稍後」或不關分頁，會長期停在舊殼層；舊殼層呼叫新 API 的相容性仍由契約版本（`analysisSchemaVersion`）把關，API 若有破壞性變更須同時升 `APP_CONFIG.version`。
- **忘記 `sync:sw`**：Q3 會擋下 commit 前的測試；但若有人略過測試直接部署，SW 不變 → 使用者收不到新殼層（cache-first）。`docs/deployment.md` 須寫明。
- **開發者本機殘留 SW**：`localhost:3000` 曾以 `?sw=1` 註冊後，之後不帶參數仍受控；以 `?sw=0` 或 DevTools 解除。
- **iOS**：主畫面圖示只看 `apple-touch-icon`；Cache Storage 可能被系統清除；standalone 下列印、下載行為待實機確認。
- 本 Feature 不加頁面 CSP；之後加 CSP 時須同時允許 SW 對四個 CDN 網域的 `connect-src`。

## 13. 未決事項（start 時先採預設）

1. `short_name`：預設「跑姿分析」。
2. Tailwind／Google Fonts 是否也做執行期快取（D6）：預設是（否則離線殼層無樣式）。
3. 更新提示文案與位置：預設底部置中 toast、文案如 5.5 節。
4. `smoke-test.mjs` 是否加 PWA 檢查：預設不加（避免連動 `deploy-config` 測試的 fakeFetch），改在 `docs/deployment.md` 寫 `curl -I` 指令。
5. `SHELL_HASH` 是否也併入 `npm run sync:legacy`：預設不併，維持獨立 `sync:sw`，由 Q3 提醒。
