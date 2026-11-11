# Feature 3.2 — 搬入現有 Client UI

## Status

`done`

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

把舊專案的 Client（`index.html`＋`styles/main.css`＋`js/*.js` 全域 script）**原樣**搬進本專案，讓 `npm run dev` 的 `/` 打開後與舊專案的畫面和行為相同：選擇／拖入影片、MediaPipe 擷取、本地分析、切換 Profile、播放骨架動畫、匯入／匯出 JSON。

依 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) **D0 (a)**：原樣搬入的 Client 若要行為不變，必須連同**舊核心 script**（舊 `js/biomechanics.js`、`keyframes.js`、`landmark-extract.js`、`cycle-analysis.js`）一起進瀏覽器。本 Feature 因此必須：

1. 舊核心集中在**單一目錄**，每個檔頭標「暫時，3.3 移除」；
2. 與 server-only 的 `lib/core/` 在路徑、名稱、工具鏈上**明確分開**，不可互相 import；
3. 建立「**3.2 完成後不得部署**」的防線（程式防線＋文件措辭），直到 3.3 移除暫時核心；
4. 如實更新 `docs/privacy.md`、`README.md`、`AGENTS.md` 中與現況不符的敘述。

**行為不變**：不接 `/api/analyze`（3.3）、不拆 `lib/player/`／`lib/profiles/`／`lib/landmarks/`（3.3）、不 React 化、不修既有缺陷。不修改 `lib/`；`npm test` 的基準（walk 103／361ms／96、三份 landmarks 193／176／150）照舊通過。

## Next.js 16.4.6 文件查證（`node_modules/next/dist/docs/`）

| 主題 | 文件 | 結論 |
| ---- | ---- | ---- |
| `public` 資料夾 | `01-app/03-api-reference/03-file-conventions/public-folder.md` | `public/` 下的檔案（含 `.html`）從根路徑原樣提供，例如 `public/legacy/index.html` → `/legacy/index.html`；**不經 bundler**。預設 `Cache-Control: public, max-age=0`（舊檔的 `?v=3.1` 快取破壞參數照留無害）。App Router 下 public 檔與 `app/` 路由同名才會衝突；`/legacy/*` 無對應路由 |
| `redirects` | `01-app/03-api-reference/05-config/01-next-config-js/redirects.md` | 在 filesystem（含 `app/` 頁面與 `public/`）**之前**檢查；`permanent: false` 回 307。用來讓 `/` 導向 `/legacy/index.html` |
| `rewrites` | 同目錄 `rewrites.md` | `beforeFiles` 可把 `/` 改寫到 public 檔，但**瀏覽器網址仍是 `/`**，舊 `index.html` 的相對路徑（`js/config.js`、`styles/main.css`）會解析成 `/js/...` 而 404；要用就得改寫所有 `src`／`href`，違反「原樣」。不採用 |
| `next/script` | `01-app/02-guides/scripts.md` | `beforeInteractive` 只能放 root layout；預設 `afterInteractive` 在 hydration 之後載入，此時 `DOMContentLoaded` 已觸發 → 舊 `index.html:2083` 與 `js/ui.js` 的 `DOMContentLoaded` 啟動程式**不會執行**；inline script 須有 `id`。舊程式改走這條要改啟動流程，風險高 |
| Vite／SPA 遷移 | `01-app/02-guides/migrating/from-vite.md` | 官方路線是把 `index.html` 轉成 root layout＋`dynamic(..., { ssr: false })` 的 Client Component。適用於 ES module 化的 React 程式，不適用 1,300 行 HTML＋11 支全域 script＋28 個 inline handler |
| CSP | `01-app/02-guides/content-security-policy.md` | 頁面 CSP 若用 nonce 須動態渲染；`'unsafe-inline'` 版本可靜態。public 的 `.html` 不經 Next 渲染，**無法注入 nonce**。見第 6 節 |
| `headers()` | `05-config/01-next-config-js/headers.md` | 現有 `source: "/api/:path*"` 只套用 `/api`，**不影響 public 檔與 `/`** |

## 舊專案現況（唯讀盤點）

**盤點基準：舊專案 commit `e29766d`**（工作區乾淨，與 3.1 相同）。路徑相對舊專案根目錄 `D:\MyWeb\Running form analyzer`。

### 檔案清單與目的位置

| 舊檔 | 行數 | 內容 | 本專案位置 | 處理 |
| ---- | ---- | ---- | ---------- | ---- |
| `index.html` | 2093 | 標記、Tailwind 設定 inline script（42–64）、主 inline script（1336–2091，含 `onCameraModeChange`、`updateTelemetryAndDiagnostics`、`renderSimVideo`、`DOMContentLoaded` 啟動） | `public/legacy/index.html` | 原樣；只做第 3 節列出的**同行替換**（行數不變） |
| `styles/main.css` | — | 自訂樣式（含報告 `.rp-*`），無 `url()`／`@import` | `public/legacy/styles/main.css` | 原樣 |
| `js/config.js` | 123 | `APP_CONFIG`（重複一份）、`applyAppConfig`、`RUNNER_PROFILES` | `public/legacy/js/config.js` | 原樣；版本同步由測試把關（第 7 節） |
| `js/state.js` | 26 | 全域可變狀態 | `public/legacy/js/state.js` | 原樣 |
| `js/ui.js` | 411 | 影片選擇／拖入（`loadVideoFile`、`URL.createObjectURL`）、`switchProfile`、播放切換 | `public/legacy/js/ui.js` | 原樣 |
| `js/renderer.js` | 726 | 模擬器、波形、HUD、`animateLoop` | `public/legacy/js/renderer.js` | 原樣（含已知的左右腳標示錯誤，見第 10 節） |
| `js/pose.js` | 103 | MediaPipe 初始化（`locateFile` → `cdn.jsdelivr.net/npm/@mediapipe/pose/`）、夜間增亮、`sanitizeLandmarks` | `public/legacy/js/pose.js` | 原樣 |
| `js/analyzer.js` | 466 | 擷取、本地分析、匯入／匯出 JSON | `public/legacy/js/analyzer.js` | 原樣 |
| `js/biomechanics.js` | 618 | **舊核心** | `public/legacy/temp-core/biomechanics.js` | 原樣＋3 行檔頭（第 4 節） |
| `js/keyframes.js` | 102 | **舊核心** | `public/legacy/temp-core/keyframes.js` | 同上 |
| `js/landmark-extract.js` | 243 | **舊核心** | `public/legacy/temp-core/landmark-extract.js` | 同上 |
| `js/cycle-analysis.js` | 419 | **舊核心** | `public/legacy/temp-core/cycle-analysis.js` | 同上 |
| `js/report.js` | 209 | 報告匯出（舊 Feature 3.1；路線圖 3.4 搬入） | 預設**不搬**（待決定 2） | 見第 3 節 |
| `server/`、`docs/`、`context/`、`.temp/` | — | 舊 Server 與文件 | 不搬 | Server 已由 Epic 1–2 取代 |

### 外部資源（`index.html` 的 `<head>`）

| 行 | 資源 | 用途 | 本 Feature |
| -- | ---- | ---- | ---------- |
| 10–13 | `data:image/svg+xml` favicon | 🏃 圖示 | 原樣（`app/icon.svg` 對 public 的 HTML 無作用） |
| 15 | `https://cdn.tailwindcss.com`（未釘版） | Tailwind Play CDN，執行期產生 CSS；console 會印「不應用於 production」的 **warning** | 原樣（待決定 4） |
| 17–22 | `fonts.googleapis.com`／`fonts.gstatic.com` | Inter、JetBrains Mono、Noto Sans TC | 原樣 |
| 25–40 | `cdn.jsdelivr.net/npm/@mediapipe/{camera_utils,control_utils,drawing_utils,pose}`（未釘版、`crossorigin="anonymous"`） | MediaPipe Pose（legacy solution）；`drawing_utils` 由 `js/analyzer.js:25–32` 使用；`camera_utils`、`control_utils` grep 不到使用點 | 原樣；未使用的兩支記錄為日後清理，不在本 Feature 刪除 |
| `js/pose.js` `locateFile` | `cdn.jsdelivr.net/npm/@mediapipe/pose/<file>` | 執行期再抓 wasm、`.data`、`.binarypb`、模型（`modelComplexity: 2` → heavy 模型） | 原樣；實際檔名與大小以 Verification 第 5 步的 network 紀錄為準，寫入 Notes |

### 盤點結果（與隱私、CSP 相關）

- 舊 Client（`index.html`、`js/*.js`、`styles/main.css`）**沒有** `localStorage`／`sessionStorage`／`indexedDB`／`document.cookie`／`fetch(`／`XMLHttpRequest`／`sendBeacon`／`WebSocket`／`getUserMedia`／`eval(`／`new Function`（grep 確認）。網路請求只來自 `<head>` 的第三方資源與 MediaPipe 的 `locateFile`。
- 影片：`URL.createObjectURL(file)`（`js/ui.js:119`）在記憶體內播放；JSON 匯入用 `FileReader`（`js/analyzer.js:299`），匯出用 Blob 下載（`js/analyzer.js:460`）。都不離開瀏覽器。
- 有 28 個 inline 事件屬性（`onclick=`、`onchange=`…）、兩段 inline `<script>`、大量 `innerHTML`。
- `console.error`／`warn`／`info` 出現在 `js/analyzer.js:305`、`310`、`351`、`355`、`429` 等處——**只在使用者瀏覽器的 console**，不是 Server log。

## 範圍

### 目錄與檔名

```
public/
  legacy/                          # 新增：原樣搬入的舊 Client（過渡期；React 化前的 UI 正本）
    index.html
    styles/main.css
    js/
      config.js  state.js  ui.js  renderer.js  pose.js  analyzer.js
    temp-core/                     # 新增：舊核心（暫時，3.3 移除）。唯一允許放舊核心的位置
      biomechanics.js  keyframes.js  landmark-extract.js  cycle-analysis.js
app/
  page.js                          # 刪除：佔位頁（/ 改由 redirects 導向，見設計決策 2）
  layout.js、icon.svg、api/        # 不動
next.config.mjs                    # 修改：redirects()（/ → /legacy/index.html）、部署防線（設計決策 5）；headers() 不動
eslint.config.mjs                  # 修改：globalIgnores 加 "public/legacy/**"（附註解：舊全域 script，3.3／React 化時移除忽略）
tests/
  legacy-client.test.js            # 新增：temp-core 隔離與標示、版本同步、瀏覽器儲存／網路檢查、部署防線（第 7 節）
docs/
  privacy.md                       # 更新：第 1、2、5、8、9、10、11 節（第 8 節）
  client-server-boundary.md        # 更新：第 8 章 3.2 項目標記完成、記錄 temp-core 行號位移
  planning/epics-and-features.md   # 更新（complete 時）：3.2 狀態；4.1 加前置條件
README.md                          # 更新：目前狀態、架構一句話的過渡期註記
AGENTS.md                          # 更新：「專案背景」加一行過渡期說明（第 8 節）
context/current-feature.md         # Notes（驗證結果）
```

- **不修改** `lib/`（含 `lib/config.js`）、`app/api/`、`app/layout.js`、既有 `tests/*.test.js`（`privacy-docs.test.js` 視第 7 節需要只**新增**斷言）、`package.json`、`package-lock.json`、`vitest.config.mjs`。
- **不新增 npm 依賴**（MediaPipe、Tailwind、字型維持 CDN，見第 6 節與待決定 4）。
- 只讀舊專案；比對用暫存檔放 scratchpad。

### 非範圍

- 接 `/api/analyze`、移除本地解算、`lib/player/`／`lib/profiles/`／`lib/landmarks/`、契約 1.1.0、`POST /api/derive`（3.3）。
- 報告匯出（3.4；待決定 2）。
- React 化、Tailwind 改 build-time、字型改 `next/font`、移除未使用的 MediaPipe utils。
- 頁面 CSP 與頁面安全標頭（第 6 節；建議在 4.1 前另開 Feature）。
- 修 `fix-walking-hud-foot-label`、`getActiveRunnerTiming` 漂移、`renderSimVideo` 繞過關鍵幀、`customCycleFrames` 死碼、55／8 門檻重複、判斷式合併。
- 部署、push（使用者操作）。

## 設計決策

### 1. 放置方案：**public 靜態原樣搬入**（建議）

| 方案 | 作法 | 優點 | 缺點 |
| ---- | ---- | ---- | ---- |
| **A. `public/legacy/` 靜態** | 檔案原樣複製；`/` 以 `redirects` 導到 `/legacy/index.html` | 與舊專案「靜態 Client」的載入模型完全相同：classic script 順序、全域函式、inline handler、`DOMContentLoaded` 啟動都不變；幾乎零改碼；不經 bundler，不會與 `lib/core/` 混在 `.next/static/` | 網址變成 `/legacy/index.html`；舊程式不受 ESLint 管；public 檔**無法 import** `lib/` 的 ES module——3.3 要讓 UI 用 `lib/player/`、`lib/contract/` 時須另建橋接（見風險） |
| B. Client Component | `app/page.js`（`"use client"`）以 `dangerouslySetInnerHTML` 放 body，`next/script` 載入 `public/` 的 script | 網址為 `/`；3.3 起較容易接 bundled 模組 | `afterInteractive` 錯過 `DOMContentLoaded`（須改啟動程式）；`beforeInteractive` 只能放 root layout；Tailwind CDN 改 DOM 與 hydration 互動未知；inline handler 在 script 載入前被點會 ReferenceError；改動多、難以宣稱「行為不變」 |
| C. Route Handler 回傳 HTML | `app/route.js` 讀檔回傳 | 網址為 `/` | 需 `node:fs`（違反 `tests/privacy-docs.test.js` 的禁用清單）；與 `app/page.js` 衝突；資源路徑仍要處理 |

採 **A**：本 Feature 的驗收是「行為不變」，A 是唯一不需改動舊程式控制流的方案。B 的好處（接 bundled 模組）屬 3.3 的需求，屆時再決定（見未決事項 1）。

### 2. `/` 的導向

- `next.config.mjs` 新增：

  ```js
  async redirects() {
    // 3.2 過渡期：/ 導向原樣搬入的舊 Client。React 化後移除。
    return [{ source: "/", destination: "/legacy/index.html", permanent: false }];
  }
  ```

- `permanent: false`（307）：避免瀏覽器永久快取，日後 `/` 改回 React 頁時不受影響。
- 刪除 `app/page.js`：redirects 在 filesystem 之前檢查，該頁已不可達；保留只會造成「看起來有首頁」的誤解。`app/layout.js` 保留（not-found 等框架頁需要）。
- 不用 `rewrites`（相對路徑會 404，見文件查證）。

### 3. 對舊檔的唯一允許修改

為了讓 3.1 決策文件中的 `檔案:行號` 仍可追蹤，**UI 檔（`index.html`、`public/legacy/js/*.js`、`main.css`）行數一律不變**，只允許下列**同行替換**：

| 位置（舊行號＝新行號） | 原文 | 改為 | 理由 |
| ---------------------- | ---- | ---- | ---- |
| `index.html:1329–1332` | `<script src="js/biomechanics.js"></script>` 等四行 | `<script src="temp-core/biomechanics.js"></script><!-- 暫時：3.3 移除 -->` 等（同一行） | 舊核心集中到 `temp-core/` |
| `index.html:1334` | `<script src="js/report.js?v=3.1"></script>` | `<!-- report.js：3.4 搬入 -->` | 待決定 2 預設：不搬 report.js，避免 404 |
| `index.html:217`（`onclick="openReport()"` 那一行） | `onclick="openReport()"` | `disabled title="報告匯出於 3.4 提供"` | 未載入 report.js 時點擊會 ReferenceError（console error） |

- 若待決定 2 改採「搬入 report.js」，則刪去後兩列，`js/report.js` 原樣放 `public/legacy/js/report.js`。
- 其他任何差異都不允許；Verification 第 3 步以 diff 證明。
- `temp-core/` 四檔只在**檔頭加 3 行**（第 4 節），因此這四檔的行號一律 **+3**。完成時在 `docs/client-server-boundary.md` 第 2 章加一句「3.2 起，舊核心四檔位於 `public/legacy/temp-core/`，行號為舊行號 +3」。

### 4. 暫時核心的標示與隔離

**檔頭**（四檔一致，恰好 3 行，固定字串 `TEMP-CORE` 供測試與 grep）：

```js
// TEMP-CORE（暫時，3.3 移除）：舊專案核心原樣副本，僅供 3.2 過渡期的舊 Client 在瀏覽器執行。
// 正式核心是 server-only 的 lib/core/（ES module）；只由 public/legacy/index.html 以 script 載入，不得被 lib/、app/ 引用，也不得修改。
// 含本目錄的 build 不得部署（見 docs/client-server-boundary.md D0、next.config.mjs 部署防線）。
```

**與 `lib/core/` 不混淆的防線**：

| 層 | 防線 |
| -- | ---- |
| 路徑 | 只在 `public/legacy/temp-core/`；名稱含 `temp`；不在 `lib/` 下 |
| 模組系統 | 全域 classic script，沒有 `export`，**無法被 import**；`lib/core/` 是 ES module＋`import "server-only"` |
| 打包 | public 不經 bundler，不會出現在 `.next/static/`；`lib/core/` 也照舊不出現（1.1 的 bundle 檢查結論不變，但**不再代表瀏覽器拿不到核心**——Notes 須寫明） |
| 測試 | `tests/legacy-client.test.js`：`app/`、`lib/` 不含 `temp-core` 字樣（`next.config.mjs` 只允許防線檢查一處）；`lib/` 不含 `public/legacy` 字樣；四檔都以 `TEMP-CORE` 開頭；`temp-core/` 只有這四檔 |
| 工具鏈 | ESLint 忽略 `public/legacy/**`；Vitest `include` 只有 `tests/**`，不會跑到 public |
| 文件 | 決策文件、README、privacy、AGENTS 都稱它為「暫時核心（temp-core）」，與「核心（`lib/core/`）」區分 |

**不同步承諾**：temp-core 是凍結副本。若 3.3 前 `lib/core/` 有修正，temp-core **不跟著改**（避免兩份都在變），差異記入 Notes；過渡期 UI 顯示的數值以舊核心為準。

### 5. 「完成後不部署」的防線

| # | 防線 | 內容 |
| - | ---- | ---- |
| 1 | **Build 防線（建議預設，待決定 3）** | `next.config.mjs` 頂層：若 `process.env.VERCEL` 存在且 `public/legacy/temp-core/` 存在，`throw new Error("public/legacy/temp-core 仍存在：3.3 移除暫時核心前不得部署")`。Vercel 的 build 環境會設定 `VERCEL=1`，本地 `next dev`／`next build` 不受影響。3.3 刪除目錄後防線自然失效，3.3 一併移除這段程式 |
| 2 | 測試 | `tests/legacy-client.test.js` 以 `VERCEL=1` 動態 import `next.config.mjs`（加 query 字串避開模組快取），預期拋錯；不設時不拋錯 |
| 3 | 路線圖 | 4.1 說明加「前置：3.3 完成（`public/legacy/temp-core/` 已移除）」 |
| 4 | 文件措辭 | README「目前狀態」、`docs/privacy.md` 第 2 節、`AGENTS.md`「專案背景」都寫明「3.2–3.3 過渡期：瀏覽器含暫時核心，不可部署」 |
| 5 | 3.3 驗收（引用） | 3.3 須驗證 `public/` 與 `.next/static/` 都不含核心特有字串（D8 共用模組的兩個函式除外）。本 Feature 在 Notes 記下基準：選 2–3 個字串（例如 `"🚶 行走步態 (雙腳交替支撐 • 零騰空)"`、`"嚴重跨步煞車或身後推蹬"`），記錄它們在 `public/legacy/temp-core/` 命中、`.next/static/` 零命中，供 3.3 對照 |

- `next.config.mjs` 讀 `process.env` 不受 `tests/privacy-docs.test.js` 限制（它只掃 `app/`、`lib/`），但 `docs/privacy.md` 第 4 節「不讀環境變數」指的是 Server 執行期，須在第 11 節補一句「`next.config.mjs` 於 build 時讀 `VERCEL` 作為部署防線」以免誤導。
- 本防線**不提供繞過開關**；使用者若要在 3.3 前部署預覽，須自行決定移除（待決定 3）。

### 6. 第三方資源、CSP 與安全標頭

**資源來源**：預設**全部維持 CDN 原樣、不釘版**（待決定 4）。

| 資源 | 選項 | 建議 |
| ---- | ---- | ---- |
| MediaPipe（script＋`locateFile` 的 wasm／模型） | (a) CDN 原樣；(b) 釘版本號（例如 `@mediapipe/pose@<版本>`，以 Verification 第 5 步實測解析到的版本為準）；(c) 自託管：新增 npm 依賴 `@mediapipe/pose` 等，複製到 `public/`，模型＋wasm 合計可能數十 MB | 3.2 採 (a)，行為與舊專案相同、不新增依賴。(b) 行為等價且降低上游變動風險，建議在 4.1 前做（可併入頁面安全標頭 Feature）。(c) 隱私最好但新增依賴與部署體積，須使用者同意 |
| Tailwind Play CDN | 原樣；改 build-time Tailwind 屬 React 化 | (a) |
| Google Fonts | 原樣；改 `next/font` 屬 React 化 | (a) |

**現有標頭的衝突檢查**：

- `next.config.mjs` `headers()` 只對 `/api/:path*` 設 `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` 等 5 個標頭。`/`（redirect）與 `/legacy/*`（public）**不套用** → **舊 Client 不會被擋**。Verification 第 4 步以 `curl -I` 確認 `/legacy/index.html` 沒有這組 CSP，`/api/analyze` 照舊有。
- 3.2 不呼叫 API，所以 API 的 `default-src 'none'` 與同源檢查與本 Feature 無關（3.3 起 Client 對 `/api/analyze` 是同源 `fetch`，API 回應上的 CSP 不約束發出請求的頁面）。

**若日後替頁面加 CSP，舊 Client 至少需要**（記錄給後續 Feature，3.2 不加）：

- `script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'`（inline handler 與兩段 inline script 無法用 nonce，public HTML 也不能注入 nonce；MediaPipe wasm 需 `'wasm-unsafe-eval'`；Tailwind CDN 與 MediaPipe 的 emscripten loader 是否另需 `'unsafe-eval'` 須實測）
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`（Tailwind CDN 注入 `<style>`、大量 inline style）
- `font-src https://fonts.gstatic.com`；`connect-src 'self' https://cdn.jsdelivr.net`（`locateFile` 抓 `.wasm`／`.data`／模型）；`img-src 'self' data: blob:`；`media-src blob:`（`createObjectURL` 影片）
- 結論：這份 CSP 保護有限（`'unsafe-inline'`）；真正收緊要等 React 化移除 inline handler。因此 3.2 **不加頁面 CSP**，列入風險與 4.1 前的待辦。

**頁面的其他安全標頭**（`X-Content-Type-Options`、`Referrer-Policy`、`frame-ancestors`）不會破壞舊 Client，但屬範圍擴大，3.2 不加；與上一點併入同一個後續 Feature。注意：頁面目前沒有 `Referrer-Policy`，瀏覽器預設 `strict-origin-when-cross-origin`，連到 CDN 時會送出本站 origin——寫入 privacy 第 8 節。

### 7. `tests/legacy-client.test.js`（新增）

斷言刻意粗糙（存在性、字串包含），與 `privacy-docs.test.js` 同風格：

1. `public/legacy/temp-core/` 恰好有四個 `.js` 檔，每個第一行以 `// TEMP-CORE` 開頭。
2. `public/legacy/js/` 下**沒有**這四個核心檔名（核心只能在 temp-core）。
3. `app/`、`lib/` 所有 `.js` 不含 `temp-core`、`public/legacy` 字樣；`next.config.mjs` 只有防線檢查一處提到 `temp-core`。
4. `public/legacy/index.html` 以 `temp-core/` 載入四個核心，且不再引用 `js/biomechanics.js` 等舊路徑。
5. `public/legacy/js/config.js` 的 `version: "…"` 與 `lib/config.js` 的 `APP_CONFIG.version` 相同（`APP_CONFIG` 過渡期有兩份，發版時須同步兩處；`AGENTS.md`「版本設定」補一句）。
6. `public/legacy/**/*.js` 與 `index.html` 不含 `localStorage`、`sessionStorage`、`indexedDB`、`document.cookie`、`fetch(`、`XMLHttpRequest`、`sendBeacon`（支撐 privacy 第 2、9 節「不使用瀏覽器儲存、不呼叫 API」；3.3 接 API 時須改這條）。
7. 部署防線：`VERCEL=1` 時 import `next.config.mjs` 拋錯；未設時正常（測試結束還原 `process.env`）。

`tests/privacy-docs.test.js` 不動既有斷言；若第 8 節的 privacy 新敘述需要一致性檢查（例如「privacy.md 提到 `cdn.jsdelivr.net`」），只新增斷言。

### 8. 文件同步

**`docs/privacy.md`**（對照 3.1 決策文件第 7 章與 2.2 原文逐條核對）：

| 節 | 現況原文 | 3.2 後須如實改為 |
| -- | -------- | ---------------- |
| 1 摘要 | 「影片不離開瀏覽器…（設計目標，Epic 3 起）」 | 3.2 起已成立：影片由 MediaPipe 在瀏覽器處理，3.2 **完全不呼叫 API**；「Server 只收 landmarks」仍為 3.3 起 |
| 2 目前狀態 | 「Client 尚未搬入…不擷取影像、不呼叫 API、不載入第三方資源、不使用 localStorage（`app/page.js`、`app/layout.js`）」 | `/` 導向 `/legacy/index.html`（原樣搬入的舊 Client）；會在瀏覽器擷取影像、**不呼叫 API**、會載入第三方資源（第 8 節）、不使用瀏覽器儲存；**過渡期瀏覽器含暫時核心（D0），整套分析在本地執行，此版本不部署**；引用位置改為 `public/legacy/`、`next.config.mjs` |
| 5 記錄 | 只談 Server log | 補一句：舊 Client 的 `console.error`／`warn`／`info` 只在使用者瀏覽器 console，不傳到 Server |
| 8 第三方資源 | 「目前無…若 3.2 沿用…屆時須更新」 | 列出 `cdn.tailwindcss.com`、`fonts.googleapis.com`／`fonts.gstatic.com`、`cdn.jsdelivr.net`（MediaPipe script、wasm、模型）；對方可見 IP、User-Agent 與本站 origin（無 `Referrer-Policy`，瀏覽器預設）；**影片與 landmarks 不送往這些第三方**（MediaPipe 在本機執行）；未釘版本的風險 |
| 9 瀏覽器儲存 | 「目前不使用…」 | 重新確認後維持，引用 `tests/legacy-client.test.js`；補「影片以 `blob:` URL 在記憶體播放、JSON 匯入以 `FileReader` 本地讀取、匯出為本地下載」 |
| 10 日後可能改變 | 「Client 搬入（3.2）、Client 開始上傳（3.3）」 | 刪去 3.2；保留 3.3；新增「新增重算端點（D6）」「頁面 CSP／自託管第三方資源」 |
| 11 一致性 | 列出 `privacy-docs.test.js` 的檢查 | 加上 `legacy-client.test.js` 的檢查；註明 `next.config.mjs` build 時讀 `VERCEL`（部署防線），不屬 Server 執行期 |

- 第 1、4 節「核心只在 server」的縮小敘述（D8：角度擷取與閘門也在瀏覽器）屬 **3.3** 落地後的狀態，3.2 不提前寫成事實；3.2 只寫「過渡期整套核心都在瀏覽器」。

**`README.md`**：

- 第 3 行「（目標架構）」後補一句「3.2–3.3 過渡期例外：瀏覽器暫時帶舊核心，見 [client-server-boundary](docs/client-server-boundary.md)」。
- 「目前狀態」：「Epic 0–2、3.1、3.2 完成；`/` 為原樣搬入的舊 Client（含暫時核心，**3.3 完成前不可部署**）；尚未呼叫 API（3.3）。」
- 「隱私摘要」：「只上傳 landmarks（Epic 3 起）」改為「3.3 起只上傳 landmarks；3.2 不上傳任何資料」。
- 「文件」補 `docs/client-server-boundary.md` 連結。版本號不變（`APP_CONFIG` 未發版）。

**`AGENTS.md`**：「專案背景」目標條下加一行「過渡期（3.2 完成至 3.3 完成）：`public/legacy/temp-core/` 為舊核心暫時副本，不得修改、不得被 `lib/`／`app/` 引用、不得部署」；「版本設定」加「過渡期 `public/legacy/js/config.js` 另有一份 `APP_CONFIG`，發版時同步（測試把關）」。

**`docs/client-server-boundary.md`**：第 2 章加 temp-core 行號 +3 的對照；第 8 章「3.2」項目標示完成並連到本規格。不改決策內容。

**路線圖**（`/feature complete` 時）：3.2 `done`，說明改為一句結論；4.1 說明加前置條件；「待處理」的 `fix-walking-hud-foot-label` 改為「Client 已搬入（3.2），可另開 `fix-`」；55／8 那條把「3.2 搬入後暫時重複」改為已發生。

### 9. 行號對應

3.1 決策文件以舊專案 `e29766d` 的 `檔案:行號` 為準。3.2 後的對應規則（寫入 Notes 與決策文件第 2 章）：

- `index.html`、`js/{config,state,ui,renderer,pose,analyzer}.js`：路徑前加 `public/legacy/`，**行號不變**。
- `js/{biomechanics,keyframes,landmark-extract,cycle-analysis}.js` → `public/legacy/temp-core/`，**行號 +3**。
- `js/report.js`：未搬（待決定 2 預設）。

### 10. 已知待辦：行走模型 HUD 左右腳標示錯誤（**只標註，不修**）

- 舊 `fix-walking-hud-foot-label`：行走模型 `p=0` 實際是右腳跟著地（右腳支撐 0–0.6），但 HUD 與波形一律把 0 到 `stancePct` 標成「左腳」。相關位置：`public/legacy/js/renderer.js:215–218`（`legName`）、`501`、`516`、`572–601`（波形「左腳著地／右腳著地」）。
- 本 Feature 原樣搬入，Verification 會看到這個錯誤，**屬預期**，Notes 註明「既有缺陷，未修」。
- 修正另開 `fix-walking-hud-foot-label`，建議在 3.3 之後（3.3 會改 `computeGctMetrics` 的資料來源，修正時須同步檢查 `stancePct` 與 `*IsStance` 的對應）。

## 驗收標準

1. `npm run dev` 後開 `/` → 307 到 `/legacy/index.html`，畫面與舊專案相同（以舊專案 `.temp/baseline-1-1-empty.png`、`baseline-1-1-imported.png` 目視比對）。
2. `public/legacy/` 與舊專案 `e29766d` 的差異只有第 3、4 節列出的修改（Verification 第 3 步）。
3. 匯入 walk 樣本後 UI 顯示**步頻 103、觸地 361ms、總分 96**，與舊專案相同。
4. 切換 Profile、播放／暫停骨架動畫、選擇影片、拖入影片、擷取分析、匯入／匯出 JSON 皆可用；console 無 error；無資源 404（Tailwind CDN 的 production warning 允許，記入 Notes）。
5. temp-core 只在 `public/legacy/temp-core/`、四檔都有 `TEMP-CORE` 檔頭；`lib/`、`app/` 無引用；`VERCEL=1` 時 build 失敗（`tests/legacy-client.test.js` 全過）。
6. `/legacy/index.html` 沒有 API 的 CSP；`/api/analyze` 標頭不變（既有測試全過）。
7. `docs/privacy.md`、README、AGENTS、決策文件依第 8 節更新，**不宣稱**尚未實作的行為（例如「只上傳 landmarks」不寫成 3.2 的現況）。
8. `git diff --stat -- lib` 為空；`npm run build`、`npm run lint` 通過；`REQUIRE_BASELINE=1 npm test` 全過且基準不變：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。** 確認 lint 沒有掃到 `public/legacy/**`。
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（含新增的 `legacy-client.test.js`），記下基準數值；另跑一次不帶變數的 `npm test`。
3. **原樣比對（一次性腳本，放 scratchpad、不提交）**：
   - 確認舊專案 `git log -1` 為 `e29766d`、`git status` 乾淨。
   - `git diff --no-index` 比對：`index.html`、`styles/main.css`、六支 UI script 只出現第 3 節的同行替換，**行數相同**；四支 temp-core 去掉前 3 行後與舊檔**逐位元組相同**（含行尾；若 Windows 換行轉換造成差異，以 `--ignore-cr-at-eol` 重跑並在 Notes 說明）。
   - 記錄 temp-core 核心特有字串在 `public/legacy/temp-core/` 的命中數，與 `.next/static/` 的零命中（第 5 節第 5 列）。
4. **HTTP 檢查（`npm run dev` 或 `npm start` 後用 `curl -i`）**：
   - `GET /` → 307，`Location: /legacy/index.html`。
   - `GET /legacy/index.html` → 200 `text/html`，**沒有** `Content-Security-Policy: default-src 'none'…`。
   - `GET /legacy/temp-core/biomechanics.js`、`/legacy/js/config.js`、`/legacy/styles/main.css?v=3.1` → 200。
   - `POST /api/analyze`（同源標頭＋樣本）→ 200，且 5 個安全標頭不變。
   - `VERCEL=1 npm run build` → 失敗並顯示防線訊息（之後確認未遺留環境變數）。
5. **Playwright（無 console error、無 404）**：
   - 載入 `/`，等待 `DOMContentLoaded` 啟動完成（`animateLoop` 在跑、標題來自 `applyAppConfig`）；收集 console 訊息與 network 請求。允許的 console：Tailwind CDN production warning；其他 warning 逐條記入 Notes。
   - network：所有 `/legacy/*` 與 CDN 請求皆 2xx／3xx；記錄 MediaPipe 實際解析到的版本與 `locateFile` 抓取的檔名與大小（選影片後才會載入）。
6. **互動驗證**（`AGENTS.md` 第 4 項）：
   - **切換 Profile**：`hsu_pose_method` → `night_track_runner` → 匯入後的 `json_*`；遙測與骨架隨之改變，無 error。
   - **播放骨架動畫**：`toggleSimPlay()` 播放／暫停、相位跳轉、圖層切換（`ghost`、`trail`）。
   - **選擇影片**：以 file input 選 `D:\MyWeb\Running form analyzer\.temp\mp4\woman03 - Trim.mp4`（唯讀引用；或複製到本專案 `.temp/mp4/`）；MediaPipe 載入、骨架疊圖出現、擷取完成並產生 `custom_captured` 結果。
   - **拖入影片**：以 Playwright 對 `#videoDropZone` 派發 `drop`（DataTransfer）載入同一支影片。
   - **匯入／匯出 JSON**：匯入 `.temp/json/running-form_captured-2026-10-29-walk.json`，確認 103／361ms／96；匯出後再匯入，數值不變。
   - **無影片預覽**：`startSimulatedVideoFeed` 的徐國峰預覽可開關。
   - **報告按鈕**：預設為 disabled 且點擊無 error（若待決定 2 改為搬入，則改驗報告浮層可開關）。
   - 觀察到的行走 HUD 左右腳標示錯誤記為「既有缺陷，未修」。
7. **（建議）與舊專案並排比對**：以靜態伺服器（例如 `python -m http.server`，不新增 npm 依賴）開舊專案 `index.html`，同一份 JSON 匯入後兩邊截圖目視一致。
8. **文件核對**：第 8 節表格逐條打勾；連結指向存在的檔案；README 版本仍為 `APP_CONFIG.version`。
9. `git status` 只有本 Feature 的檔案；`.temp/` 未提交；舊專案 `git status` 乾淨。

## 已知風險

- **暫時核心可被直接下載**：public 檔一旦部署就是公開 URL，D0 的過渡期只在本地才安全。防線 1（build guard）只擋 Vercel；其他平台或手動上傳 `public/` 不受保護——文件須明講「不可部署」，不只依賴程式。
- **3.3 的橋接問題**：public 的 classic script 不能 import `lib/player/`、`lib/contract/` 等 ES module。3.3 須選擇：(a) 新增一個 bundled 的小型 Client Component，把需要的函式掛到 `window` 供舊 UI 呼叫；(b) 在 3.3 改走方案 B；(c) 以 build 腳本把模組輸出到 public。3.3 規格須處理（見未決事項 1）。
- **第三方 CDN 未釘版**：`@mediapipe/*`、Tailwind CDN 的上游變動會直接改變行為；且使用者 IP／origin 會送到三個第三方。與舊專案相同，但新專案文件須如實記載。
- **無頁面 CSP**：inline handler＋`innerHTML` 的 XSS 面與舊專案相同；收緊需 React 化。4.1 前至少補頁面安全標頭（另開 Feature）。
- **`APP_CONFIG` 兩份**：過渡期 `lib/config.js` 與 `public/legacy/js/config.js` 並存；只有版本號有測試把關，其他欄位（`systemName`、`analysisSchemaVersion`）若改了須手動同步。
- **temp-core 與 `lib/core/` 漂移**：凍結副本不跟修正同步，過渡期 UI 數值可能與 `/api/analyze` 不同；Epic 1 證明兩者目前逐值一致，3.3 前不應修改 `lib/core/` 的行為。
- **ESLint 不檢查舊 UI**：忽略 `public/legacy/**` 是刻意的（全域 script 會產生大量誤報），代價是舊 UI 的問題不會被 lint 發現。
- **網址改為 `/legacy/index.html`**：使用者看到的路徑改變；React 化時 `/` 改回正式頁，`/legacy/*` 視需要保留或移除。
- **Playwright 的 MediaPipe 驗證依賴網路**：CDN 不可達時第 5、6 步會失敗，須與程式錯誤區分並記入 Notes。
- **`docs/privacy.md` 的引用位置**：第 2 節原本引用 `app/page.js`，刪除後須改引用，否則文件指向不存在的檔案。

## 待決定

以下有建議預設，**start 時先採預設**；使用者推翻時照實記入 Notes 與本規格。

1. **放置方案**：A `public/legacy/` 靜態＋`/` 307 導向（建議）／B Client Component＋`next/script`。建議 **A**，理由見設計決策 1；代價是 3.3 須處理橋接（風險第 2 條）。
2. **`js/report.js`**：(a) 3.2 不搬，報告按鈕同行改為 disabled，3.4 搬入（建議，依路線圖分工）／(b) 3.2 原樣搬入（更接近「行為不變」、零風險，3.4 改為「改讀衍生結果」）。建議 **(a)**；若使用者偏好 Client 完整度，(b) 也可，只差一個檔與兩行 HTML。
3. **部署防線**：`next.config.mjs` 在 `VERCEL` 環境且 temp-core 存在時 build 失敗、無繞過開關（建議）／只靠文件。建議 **加防線**；代價是 3.3 前無法用 Vercel 預覽部署（例如手機實測），需要時由使用者決定暫時移除。
4. **第三方資源**：MediaPipe、Tailwind、字型維持 CDN 原樣不釘版（建議，3.2）／3.2 就釘 MediaPipe 版本／自託管 MediaPipe（新增 npm 依賴，須同意）。建議 3.2 **原樣**，釘版與頁面安全標頭在 4.1 前另開 Feature。

## 未決事項（不阻擋開工）

1. 3.3 如何讓舊 UI 使用 bundled 的 `lib/player/`、`lib/contract/`、`lib/landmarks/`（風險第 2 條）——由 3.3 規格決定。
2. 頁面 CSP／安全標頭、MediaPipe 釘版或自託管、移除未使用的 `camera_utils`／`control_utils`——建議合併為 4.1 前的一個 Feature，列入路線圖「待處理」。
3. `/legacy/*` 在 React 化之後是否保留。
