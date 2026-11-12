# Feature 4.1 — Vercel 設定與驗證

## Status

`done`（第 15 節採建議預設；第 16 節未決事項待使用者回答）

## Epic

Epic 4 — 部署（單一 Vercel 專案）

## Objective

把本專案準備到「使用者照文件操作就能部署到單一 Vercel 專案」的狀態，並提供可對任意 base URL 執行的 smoke test，讓本地 production（`npm run build && npm start`）與部署後的網址用同一套檢查驗證。

路線圖既定：Root Directory 為 repo 根目錄、Node 24.x、Function 區域 `hnd1`。**建立 Vercel 專案、連結 GitHub、設定環境變數、`vercel deploy`、`git push` 一律由使用者親自操作**；agent 只改程式與文件、寫驗證腳本、做本地驗證。

**決定（摘要）**：

- 新增最小的 `vercel.json`，只放 `regions: ["hnd1"]`（第 6.1 節）。`preferredRegion` 在 Next 16 已 deprecated，不用。
- 兩個 API route 以 route segment config 加 `export const maxDuration = 10`（第 6.2 節）；`runtime = "nodejs"` 保留；不設定 memory。
- **不需要任何環境變數**：Origin 檢查以請求的 `Host` 比對，沒有允許清單；`app/`、`lib/` 不讀 env 由 `tests/privacy-docs.test.js` 把關（第 6.4 節）。
- 新增 `scripts/smoke-test.mjs`（只用 Node 內建 `fetch`，不加依賴）與 npm script `smoke`；新增 `docs/deployment.md`（使用者操作清單，不含任何 secret）。

**行為不變**：`lib/**`、`public/**`、`next.config.mjs` 不改；`npm test` 基準照舊（walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150）。

## 1. 目標與非目標

### 目標

1. repo 根目錄有 `vercel.json`，Function 區域固定 `hnd1`；Node 版本由 `package.json` `engines: "24.x"` 決定（已存在）。
2. `/api/analyze`、`/api/derive` 明確宣告 `runtime = "nodejs"`、`maxDuration = 10`，測試把關。
3. `npm run smoke -- --base-url <URL>` 對本地 `next start` 與部署網址都能跑，失敗時 exit code ≠ 0，輸出逐項 PASS／FAIL／INFO。
4. `docs/deployment.md`：使用者從零建立 Vercel 專案、部署、驗證、回滾的步驟清單；如實記載平台限制（4.5 MB、限流盡力而為、XFF 信任、平台 log）。
5. README、`docs/server-api.md`、`docs/privacy.md`、路線圖同步（第 11 節）。

### 非目標

- 實際部署、建立 Vercel 專案、`git push`、設定網域或環境變數（使用者操作）。
- 頁面安全標頭／CSP、第三方資源（Tailwind CDN、Google Fonts、jsdelivr MediaPipe）釘版或自託管：另開 Feature（第 16 節第 2 點決定是否擋部署）。
- 限流改外部儲存（Upstash Redis）、Turnstile、登入。
- CI（GitHub Actions）、Playwright 進 devDependencies、自動化瀏覽器 E2E 腳本。
- Preview 部署的 Deployment Protection 繞過（`x-vercel-protection-bypass` 需要 secret，不支援）。
- Vercel Web Analytics、Speed Insights、Edge Middleware／`proxy.js`、Edge runtime。
- 修改 `lib/**`、`public/**`、`next.config.mjs`、`APP_CONFIG` 版本號。

## 2. 現況盤點

基準：`master` `40d36c3`，工作區乾淨。

### 2.1 部署相關設定

| 項目 | 位置 | 現況 | 4.1 |
| ---- | ---- | ---- | --- |
| Node 版本 | `package.json:6–8` | `engines.node: "24.x"` | 不改；Vercel 以 `engines` 為準（Project Settings 不一致時以 `engines` 覆蓋並警告），文件請使用者也在 Settings 選 24.x |
| build／start | `package.json:11–13` | `next build`／`next start` | 不改；Vercel 自動偵測 Next.js，Build／Install／Output 留預設 |
| `vercel.json` | — | 不存在 | 新增（第 6.1 節） |
| `next.config.mjs` | 全檔 | `poweredByHeader: false`；`redirects()` `/` → `/index.html`（307）；`headers()` 只套 `/api/:path*` 五個安全標頭；無 `output`、無部署防線（3.7 移除，`tests/legacy-client.test.js` M2 把關） | **不改** |
| route segment config | `app/api/{analyze,derive}/route.js:4` | 只 export `runtime = "nodejs"` 與 `POST` | 加 `maxDuration` |
| route export 測試 | `tests/api-analyze-route.test.js:64–66`、`tests/api-derive-route.test.js:28–30` | export 鍵恰好 `["POST", "runtime"]` | 改為 `["POST", "maxDuration", "runtime"]` 並斷言值 |
| `.gitignore` | — | 已含 `.env*`（`!.env.example`）、`.vercel/`、`.temp/` | 不改 |
| `app/` | — | `layout.js`、`icon.svg`、`api/analyze`、`api/derive`；沒有 `page.js` | 不改 |

### 2.2 請求大小

| 層 | 上限 | 位置 | 行為 |
| -- | ---- | ---- | ---- |
| Client 上傳 | 1500 幀、約 3–3.5 MB | `public/js/state.js:29`（`MAX_UPLOAD_FRAMES`） | 擷取到上限就停 |
| `/api/analyze` | 4 MB（`4 * 1024 * 1024`）、3000 幀 | `lib/server/validate-request.js:4–5` | `Content-Length` 提早拒絕＋串流邊讀邊計數，超過回 413 `{ error: "payload_too_large" }`（帶 5 個安全標頭） |
| `/api/derive` | 16 KB | `lib/server/validate-derive-request.js:4` | 同上 |
| Vercel Function | 請求 body 約 4.5 MB | 平台 | 超過時由平台直接回 413（`FUNCTION_PAYLOAD_TOO_LARGE`，非本 API 格式、**不帶**本 API 安全標頭、不進入函式、不計入限流） |
| 本地 `next start` | 無平台層 | — | 任何大小都由本 API 的 413 處理 |

結論：本 API 上限 4 MB 在平台 4.5 MB 之內，Client 3.5 MB 又在 4 MB 之內，三層單調遞減，**不需要調整**。部署後只有 > 4.5 MB 的請求行為與本地不同（格式不同），smoke test 兩種都接受並標示來源（第 7 節 A13）。回應最大的是 analyze 的 101 幀 `cycleKeyframes`，遠小於平台回應上限。

### 2.3 存取控制與 serverless

- `lib/server/access-control.js`：Origin／`Sec-Fetch-Site` 檢查（比對 `Host`，無允許清單、無 env）→ 每 IP 固定視窗 30 次／60 秒，`Map` 在模組層級（每個 instance 一份）。
- IP 取 `x-forwarded-for` 第一段 → `x-real-ip` → `unknown`；註解與 `docs/server-api.md:37` 都寫「Vercel 覆寫這兩個標頭，部署後於 4.1 實測」。
- `docs/server-api.md:38`、README:39 已如實寫「僅盡力而為」及原因（多 instance、冷啟動、NAT、10,000 筆上限、IPv6）。Vercel 預設的 Fluid compute 讓同一 instance 處理多個並行請求，計數比「一請求一 instance」集中，但仍不保證跨 instance，敘述方向不變，只補一句（第 11 節）。

### 2.4 尚待部署後補的文件敘述

| 位置 | 內容 |
| ---- | ---- |
| `docs/server-api.md:3` | 「部署見 4.1」 |
| `docs/server-api.md:37` | XFF 可信度「部署後於 4.1 實測」 |
| `docs/server-api.md:76` | 平台 413「部署後（4.1）實測」 |
| `docs/privacy.md:73` | 平台 log「4.1 部署後補上查證結果」 |
| `docs/privacy.md:83` | 第三方資源「自託管或釘版留待 4.1 前處理」（與路線圖「另開 Feature」不一致，第 16 節第 2 點） |
| `docs/privacy.md:97` | 「部署（4.1）」列在日後須更新的情況 |

這些敘述**部署前**能改的只有「改指向 `docs/deployment.md`、說明如何驗證」；實測結果要等使用者部署並回報 smoke 輸出後才寫（第 6.7 節）。

## 3. Next.js 16.4.6 查證

依 AGENTS，start 時再讀一次確認無新 deprecation。

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`：Route Handler 可 export `runtime`（`'nodejs'` 預設，`'edge'` deprecated）、`preferredRegion`（**deprecated**）、`maxDuration`（預設由部署平台決定）。
- `…/02-route-segment-config/preferredRegion.md`：「Remove the `preferredRegion` export from your route files」；在 Vercel 只接受 `'auto'`／`'global'`／`'home'`，**不能指定 `hnd1`**。→ 區域不能用 segment config 設。
- `…/02-route-segment-config/maxDuration.md`：`export const maxDuration = 5`（秒），平台從 build output 讀取。`07-adapters/09-output-types.md` 的 function output `config.maxDuration` 確認此值會傳給 adapter（Vercel adapter 走同一公開 API，`02-guides/deploying-to-platforms.md:81`）。
- `route.md:647–659`：Route Handler 的 segment config 範例含 `runtime = 'nodejs'`。
- `05-config/01-next-config-js/redirects.md`：`permanent: false` → 307，不快取；現行 `/` → `/index.html` 不需改。
- `01-getting-started/17-deploying.md`：Vercel 為已驗證的部署目標，無額外設定需求。
- `app/api/*/route.js:3` 已註明「啟用 Cache Components 須移除 runtime export」，本 Feature 不啟用，照舊。

Vercel 平台事實（**start 時以 Vercel 官方文件再查證一次**，查證結果寫入 Notes，與下表不符時以官方為準並更新本規格）：`vercel.json` `regions` 可指定 Function 區域（Hobby 限單一區域）；請求 body 上限 4.5 MB；Fluid compute 為新專案預設，`maxDuration` 預設與上限依方案；`engines.node` 決定 Node 版本；`x-vercel-id` 回應標頭含處理區域代碼；Preview 部署預設開啟 Deployment Protection（未登入回 401／導向登入）。

## 4. 作法比較

### 4.1 區域 `hnd1`：**`vercel.json` `regions`**

| 選項 | 評估 |
| ---- | ---- |
| **A. `vercel.json` `{ "regions": ["hnd1"] }`（建議）** | 進 git、可被測試把關、重建專案時不會漏設；官方支援的專案層級設定 |
| B. 只在 Dashboard「Functions → Function Region」設定 | 不在 repo，重建專案或換帳號容易漏；無法測試 |
| C. `export const preferredRegion = "hnd1"` | Next 16 deprecated，且 Vercel 只接受 `auto`／`global`／`home`，會在 build 丟錯。不可行 |

`vercel.json` 會覆蓋 Dashboard 設定；文件請使用者在 Dashboard 只做「確認顯示為 hnd1」。

### 4.2 執行時間上限：**route segment config `maxDuration`**

| 選項 | 評估 |
| ---- | ---- |
| **A. 兩個 route 各 `export const maxDuration = 10`（建議）** | Next 原生、與 `runtime` 放同一處，平台中立（不綁 Vercel 檔名），測試可直接 import 斷言 |
| B. `vercel.json` `functions: { "app/api/**/route.js": { maxDuration: 10 } }` | 綁 Vercel 的檔案 glob，與 segment config 同時存在時優先序要另外推理 |
| C. 不設定，用平台預設 | 平台預設（Fluid compute 下可達數百秒）遠大於需求；萬一出現異常輸入讓解算卡住，單一請求可佔用很久，浪費額度 |

值 10 秒的依據：analyze 為純 CPU 解算、上限 3000 幀；Client 逾時 analyze 30 s（`public/js/state.js:30`）、derive 10 s（`public/js/derive.js:5`）。start 時用 3000 幀合成請求在本地量測 analyze 耗時（寫入 Notes）；若本地 > 2 s，改為 30 並記錄理由。

### 4.3 記憶體：**不設定**

Hobby 的 Function 記憶體固定；Pro 在 Dashboard 調整。解算單次最大輸入 4 MB JSON，預設記憶體足夠。不寫 `functions.memory`（Fluid compute 下改由 Dashboard 設定，寫在 `vercel.json` 反而可能被忽略或報錯）。

### 4.4 驗證腳本：**Node 內建 `fetch` 的 HTTP smoke test，不加 Playwright 依賴**

| 選項 | 評估 |
| ---- | ---- |
| **A. `scripts/smoke-test.mjs` 只做 HTTP 層（建議）** | 無新依賴；可對任何 base URL 跑；涵蓋狀態碼、標頭、MIME、轉址、存取控制、大小上限、API 正確性 |
| B. 加 `@playwright/test` 寫瀏覽器 E2E | 新依賴（需使用者同意）、需下載瀏覽器；MediaPipe 擷取需要影片與 GPU，不穩定。瀏覽器層改列在 `docs/deployment.md` 的手動檢查清單，agent 本地驗證照舊用 Playwright MCP |

## 5. 範圍

```
vercel.json                        # 新增：{ "$schema", "regions": ["hnd1"] }
app/api/analyze/route.js           # 修改：加 export const maxDuration = 10（附註解）
app/api/derive/route.js            # 修改：同上
scripts/smoke-test.mjs             # 新增：第 7 節
package.json                       # 修改：scripts 加 "smoke": "node scripts/smoke-test.mjs"
tests/api-analyze-route.test.js    # 修改：export 鍵與 maxDuration 值
tests/api-derive-route.test.js     # 修改：同上
tests/deploy-config.test.js        # 新增：第 8 節 V1–V4
docs/deployment.md                 # 新增：第 9 節
README.md、docs/server-api.md、docs/privacy.md、docs/planning/epics-and-features.md
context/current-feature.md         # Notes
```

- **不修改**：`lib/**`、`public/**`、`next.config.mjs`、`eslint.config.mjs`、`vitest.config.mjs`、`AGENTS.md`、`APP_CONFIG`。
- **不新增依賴。** 不新增 `.env.example`（沒有環境變數）。

## 6. 設計決策

### 6.1 `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["hnd1"]
}
```

- 只放這一項。不放 `framework`、`buildCommand`、`installCommand`、`outputDirectory`（自動偵測即可，多寫一份就多一個與 `package.json` 不一致的來源）、不放 `headers`／`redirects`（已在 `next.config.mjs`，單一來源）、不放 `functions`。
- 不放 `crons`、`rewrites`、`cleanUrls`、`trailingSlash`。

### 6.2 route segment config

```js
// 若日後啟用 Cache Components（cacheComponents），須移除此 runtime export。
export const runtime = "nodejs";
// 執行上限（秒）：純 CPU 解算，正常 < 1 s；上限防止異常輸入長時間佔用。部署平台讀取，本地 next start 不強制。
export const maxDuration = 10;
```

兩個 route 相同。值的依據與調整條件見第 4.2 節。

### 6.3 Node 版本

`engines.node: "24.x"` 已存在，不改。`docs/deployment.md` 請使用者在 Project Settings 也選 24.x，避免 build log 出現不一致警告。

### 6.4 環境變數：**不需要**

- 讀程式確認（未讀 `.env*`）：`app/`、`lib/` 沒有 `process.env`（`tests/privacy-docs.test.js:55–70` 禁止）；`next.config.mjs` 也沒有（3.7 移除 `VERCEL` 防線，M2 把關）。
- Origin 檢查比對 `Host`（`access-control.js:50–58`），自動適用 `*.vercel.app` 與日後的自訂網域，不需要允許清單。
- `scripts/smoke-test.mjs` 不在上述掃描範圍；它只讀命令列參數，**也不讀環境變數**（避免誘導把 secret 放進環境）。
- 文件寫明：「本專案目前不需要任何環境變數；Vercel 自動注入的系統變數（`VERCEL`、`VERCEL_ENV` 等）程式不讀取。日後若新增（例如 Turnstile secret），只在 Vercel Dashboard 設定，不進 git、不貼進對話。」

### 6.5 本地 production 驗證

```
npm run build
npm start                       # 預設 http://localhost:3000
npm run smoke                   # 另一個終端機；預設 base URL http://localhost:3000
```

本地與部署後的預期差異由腳本自動判斷（base URL 為 `localhost`／`127.0.0.1` 時視為本地），差異只有：A12 平台 413、R2 XFF 偽造、`x-vercel-id`，見第 7 節。

### 6.6 限流在 serverless 的說明

- 程式不改。文件（`docs/deployment.md`、`docs/server-api.md`）維持「僅盡力而為」並補：Fluid compute 下一個 instance 可同時處理多個請求，計數較集中，但流量上升時會擴到多個 instance、各自計數；冷啟動、重新部署、instance 回收都會歸零；**部署後 smoke 的 429 測試結果只代表「當下打到的那個 instance」**，不能證明全域配額。
- smoke 的限流測試預設**不跑**（會用掉測試者 IP 的額度、讓自己 60 秒內被 429），以 `--rate-limit` 開啟。

### 6.7 部署後才能寫的文件內容

本 Feature 的 complete 不以「已部署」為條件（部署由使用者操作）。部署前：文件中的「4.1 實測」敘述改成「部署後以 `npm run smoke -- --base-url … --rate-limit` 驗證，結果見 `docs/deployment.md`「部署實測紀錄」」，並在 `docs/deployment.md` 留一個「部署實測紀錄」小節（表格，初始為「尚未部署」）。使用者部署並把 smoke 輸出貼回後，另以 `docs:` commit 填入（不另開 Feature），內容只記狀態碼與觀察，不記網址以外的識別資訊（網址是否記載見第 16 節第 3 點）。

## 7. `scripts/smoke-test.mjs`

### 7.1 介面

```
node scripts/smoke-test.mjs [--base-url <URL>] [--rate-limit] [--expect-region <code>] [--timeout <ms>]
npm run smoke -- --base-url https://<專案>.vercel.app --expect-region hnd1
```

- `--base-url` 預設 `http://localhost:3000`；只接受 `http:`／`https:`，去掉結尾 `/`；帶路徑或 query 時拒絕（exit 2）。
- `--timeout` 每個請求逾時，預設 30000。
- 只用 Node 24 內建 `fetch`、`AbortSignal.timeout`，`redirect: "manual"`；不寫檔、不讀 env、不印 response body 全文（只印狀態、必要標頭、摘要欄位）。
- valid 請求的 payload：`import { SIM_CAPTURE_REQUEST } from "../lib/profiles/sim-capture.js"`（預先烘焙的合成 landmarks，非使用者資料、非 server-only），不依賴 `.temp/` 樣本。
- 輸出：每項一行 `PASS`／`FAIL`／`INFO`＋編號＋說明＋實測值；最後總結。任何 `FAIL` → exit 1；參數錯誤 → exit 2。
- 結構：檢查項目為純資料陣列＋小型 runner；`runChecks({ baseUrl, fetchImpl, options })` export 出來供 Vitest 以假 `fetch` 測試，`import.meta.main`（或比對 `process.argv[1]`）時才執行 CLI。

### 7.2 預設檢查（計入限流的 POST 共 9 次，低於 30）

| # | 請求 | 預期 |
| - | ---- | ---- |
| P1 | `GET /` | 307，`Location` 為 `/index.html`（相對或同源絕對皆可） |
| P2 | `GET /index.html` | 200，`text/html`，內容含 `<title>`；無 `X-Powered-By` |
| P3 | `GET /js/analyzer.js`、`/js/derive.js`、`/js/report.js`、`/modules/bridge.js`、`/modules/player/index.js` | 200，`Content-Type` 含 `javascript` |
| P4 | `GET /styles/main.css` | 200，`text/css` |
| P5 | `GET /legacy/index.html`、`/legacy/temp-core/biomechanics.js` | 404（舊路徑與暫時核心不存在） |
| A1 | `GET /api/analyze`、`GET /api/derive` | 405，帶 5 個安全標頭（值逐字比對 `next.config.mjs`） |
| A2 | `OPTIONS /api/analyze` | 204 且有 `Allow`；**沒有**任何 `Access-Control-*` 標頭 |
| A3 | `POST /api/analyze` 合成 payload，無 Origin／Sec-Fetch-Site | 200；`schemaVersion === "1.1.0"`、`source === "server"`、`cycleKeyframes.length === 101`、有 `metrics.gct`；5 個安全標頭；無 `Access-Control-*`；INFO 印出耗時與 `x-vercel-id` |
| A4 | 同 A3，加 `Origin: <base origin>` | 200 |
| A5 | 同 A3，加 `Sec-Fetch-Site: same-origin` | 200 |
| A6 | 同 A3，加 `Sec-Fetch-Site: cross-site` | 403 `{ error: "forbidden" }`（不計數） |
| A7 | 同 A3，加 `Origin: https://example.invalid` | 403（不計數） |
| A8 | `POST /api/analyze`，`Content-Type: text/plain` | 415 |
| A9 | `POST /api/analyze`，body `{` | 400 `invalid_request` |
| A10 | `POST /api/derive` `{ summary: {}, cadence: 180, includeKeyframes: true }` | 200；`cycleKeyframes.length === 101`；有 `metrics.gct` |
| A11 | `POST /api/derive` 帶未知頂層欄位 | 400 |
| A12 | `POST /api/analyze` body 約 4.2 MB（合法 JSON 外殼＋填充字串，`Content-Length` 正確） | 413 且 body 為 `{ error: "payload_too_large" }`（在平台上限內，必須由本 API 回應，帶安全標頭） |
| A13 | `POST /api/analyze` body 約 5 MB | 413；body 是本 API JSON → INFO「本 API 拒絕」（本地預期）；否則 INFO「平台拒絕」（Vercel 預期）。兩者都 PASS，其他狀態碼 FAIL |
| G1 | `--expect-region <code>` 時 | A3 的 `x-vercel-id`（格式 `<邊緣 PoP>::<Function 區域>::<id>`）的 Function 區域等於該代碼，否則 FAIL；少於三段只報 INFO；未給參數只印 INFO。本地沒有此標頭 → INFO |

A3–A5 的 200 若遇到 429（測試者剛用過額度），印出 `Retry-After` 並 FAIL，提示等待後重跑。

### 7.3 `--rate-limit`（選用）

| # | 動作 | 預期 |
| - | ---- | ---- |
| R1 | 連續 `POST /api/derive`（合法、最小 body）最多 40 次，直到 429 | 出現 429，`Retry-After` 為 1–60 的整數；INFO 印出第幾次觸發（理想值 = 31 − 已用次數）。部署環境下未觸發 → **INFO 而非 FAIL**（可能分散到多個 instance），本地未觸發 → FAIL |
| R2 | R1 觸發後，再送 1 次並帶 `X-Forwarded-For: 203.0.113.<隨機>` | 部署環境：仍 429 → PASS（平台覆寫 XFF，無法偽造）；200 → FAIL（XFF 可偽造，須回報）。本地：預期 200，INFO「本地 XFF 可偽造，符合文件」 |

執行前印出警告：「會用掉本機 IP 約 60 秒的 API 額度」。

## 8. 測試計畫

**既有測試**：全部照舊，`REQUIRE_BASELINE=1 npm test` 基準不變。本 Feature 不碰 `lib/`，基準通過是預期而非新證據。

**修改**：

- `tests/api-analyze-route.test.js:64–66`、`tests/api-derive-route.test.js:28–30`：export 鍵改為 `["POST", "maxDuration", "runtime"]`；`maxDuration` 為 1–60 的整數且兩個 route 相同（不寫死 10，留給第 4.2 節的調整；值本身由 V2 與文件一致性把關）。

**新增 `tests/deploy-config.test.js`**：

- **V1 `vercel.json`**：可 JSON.parse；鍵恰好 `["$schema", "regions"]`；`regions` 等於 `["hnd1"]`；不含 `functions`、`headers`、`redirects`、`rewrites`、`env`、`build`。
- **V2 文件一致**：`docs/deployment.md` 含 `hnd1`、`24.x`、route 的 `maxDuration` 值、`4.5`、`npm run smoke`；含「不需要任何環境變數」字樣；不含 `VERCEL_TOKEN`、`x-vercel-protection-bypass` 實值、`sk_`／`Bearer ` 等 secret 樣式字串。
- **V3 smoke 腳本靜態檢查**：`scripts/smoke-test.mjs` 不含 `process.env`、`writeFile`、`node:fs`；不 import `lib/server/`（只允許 `lib/profiles/sim-capture.js`）；`package.json` `scripts.smoke` 指向它；`package.json` 依賴清單與 `master` 相同（只比 key 集合：`next`、`react`、`react-dom`／`eslint`、`eslint-config-next`、`vitest`）。
- **V4 smoke runner 邏輯**：以假 `fetchImpl` 驗證 `runChecks`：
  - 全部符合預期 → 無 FAIL；
  - A6 回 200 → 該項 FAIL；
  - A12 回非 JSON 413 → FAIL（在平台上限內必須由本 API 回應）；
  - A13 回非 JSON 413 → PASS＋INFO「平台拒絕」；
  - A1 少一個安全標頭 → FAIL；A2 帶 `Access-Control-Allow-Origin` → FAIL；
  - `--base-url` 為 `ftp://x`、帶路徑 `/foo` → 參數錯誤。
- **V5 端到端（本地）**：不放進 Vitest（需啟動 `next start`）；列在 Verification 第 3 步。

**驗證測試會抓到錯誤**（start 時做一次、記錄後還原）：把 `vercel.json` 改成 `iad1`，V1 失敗；刪掉 `derive/route.js` 的 `maxDuration`，route 測試失敗；build 時在 `next.config.mjs` 暫時移除一個安全標頭、還原設定檔後對該 build 跑 smoke，A1 FAIL 且 exit 1（A3 不會，POST 的標頭來自 `http-handler.js`）。

## 9. `docs/deployment.md` 內容大綱

繁體中文；**不放任何真實 secret、token、帳號 ID、團隊 slug**；網址以 `https://<專案>.vercel.app` 佔位。

1. **概要**：單一 Vercel 專案；頁面與 `public/` 靜態檔由 CDN 提供；`/api/analyze`、`/api/derive` 為 Node.js Function，區域 `hnd1`（東京）、`maxDuration` N 秒；沒有資料庫、沒有環境變數、沒有外部服務。
2. **前提**：3.7 已完成（暫時核心已移除）；Node 24.x；GitHub repo 已存在；Vercel 帳號（方案見第 16 節第 1 點）。尚未處理的已知項目：頁面安全標頭／CSP、第三方 CDN 未釘版（連結另開的 Feature）。
3. **部署前本地檢查（使用者或 agent）**：`npm ci` → `npm run lint` → `REQUIRE_BASELINE=1 npm test` → `npm run build` → `npm start` → 另一終端 `npm run smoke`，全部 PASS。
4. **建立 Vercel 專案（使用者操作清單）**：
   1. Vercel Dashboard → Add New → Project → Import 本 GitHub repo。
   2. Framework Preset：Next.js（自動偵測）；**Root Directory：留空（repo 根目錄）**；Build／Install／Output Command：不覆寫。
   3. Environment Variables：**不需新增任何變數**。
   4. Deploy。
   5. Settings → General → Node.js Version：24.x（與 `engines` 一致）。
   6. Settings → Functions：確認 Function Region 顯示 `hnd1`（由 `vercel.json` 決定，勿在此改）；Fluid compute 維持預設。
   7. **不要啟用** Web Analytics、Speed Insights（會加入第三方追蹤，與 `docs/privacy.md` 第 9 節衝突；要啟用須先改隱私文件）。
   8. Deployment Protection：Preview 維持預設保護；smoke test 對 Production 網址執行。
5. **部署後驗證**：
   - `npm run smoke -- --base-url https://<專案>.vercel.app --expect-region hnd1`
   - 等 60 秒後 `npm run smoke -- --base-url https://<專案>.vercel.app --rate-limit`（說明會短暫用掉自己的額度）。
   - 瀏覽器手動清單：開 `/`（應落在 `/index.html`）、DevTools console 無 error、Network 無 4xx（第三方 CDN 除外說明）；選影片擷取 → 一次 `POST /api/analyze` 200；切換 Profile、播放骨架、拖入影片、匯入 JSON、手動步頻、匯出報告。
   - 把 smoke 輸出（可去掉網址）交給 agent 填入第 10 節紀錄。
6. **環境變數**：目前不需要；原因（Host 比對、程式不讀 env、測試把關）；日後新增 secret 的規則（只在 Dashboard、分環境、不進 git／對話、`.env*` 已 gitignore）。
7. **平台限制與如實說明**：
   - 請求大小：Client 1500 幀（約 3.5 MB）< API 4 MB < 平台 4.5 MB；> 4.5 MB 由平台回 413、格式不同、不帶本 API 標頭。
   - 執行時間：`maxDuration` N 秒，超過平台回 504。
   - 限流：每 instance 記憶體計數、盡力而為（多 instance、Fluid compute 並行、冷啟動／重新部署歸零、NAT 共用、IPv6）；嚴格配額需外部儲存。
   - IP：只在 Vercel 為最外層時可信；**不要在 Vercel 前面再加會改寫 XFF 的 proxy**，也不要把 `next start` 直接暴露在網路上。
   - 平台 log：Vercel 會記錄請求 metadata 與 runtime log（本程式只有固定字串 `analyze failed`／`derive failed`）；保留期依方案，以 Vercel 官方說明為準。
   - 頁面目前沒有安全標頭／CSP，第三方資源未釘版（已知、另開 Feature）。
8. **自訂網域（選用）**：Dashboard → Domains 新增；同源檢查依 `Host`，不需改程式；加網域後以新網址重跑 smoke。
9. **更新與回滾**：push 到預設分支觸發 Production 部署（使用者操作）；問題時用 Dashboard 的 Instant Rollback／Promote 舊部署；回滾後重跑 smoke。
10. **部署實測紀錄**：表格（日期、commit、smoke 結果摘要、A13 由誰回 413、R2 XFF 結果、`x-vercel-id` 區域、analyze 耗時），初始「尚未部署」。
11. **疑難排解**：401／導向登入（Deployment Protection，改用 Production 網址）；403（瀏覽器跨站或 Host 不符）；413 非 JSON（平台上限）；429（等 `Retry-After`）；504（超過 `maxDuration`）；build 失敗（先本地 `npm run build`，檢查 Node 版本）。

## 10. 實作步驟

1. 開 branch `feature-vercel-config`；依 AGENTS 重讀第 3 節 Next 文件，並查 Vercel 官方文件確認第 3 節末段的平台事實，寫入 Notes。
2. 本地量測：以 3000 幀合成請求（`SIM_CAPTURE_REQUEST.frames` 重複並調整 `t`，一次性腳本放 scratchpad）對 `next start` 的 `/api/analyze` 計時 5 次，記錄最大值，決定 `maxDuration`（第 4.2 節）。
3. 新增 `vercel.json`；兩個 route 加 `maxDuration`；改 route 測試。
4. 寫 `scripts/smoke-test.mjs`、`package.json` `smoke`；寫 `tests/deploy-config.test.js`。
5. 寫 `docs/deployment.md`，同步其他文件（第 11 節）。
6. Verification；Notes 寫入 `context/current-feature.md`。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `README.md` | `:9` 目前狀態加「4.1：Vercel 設定與驗證腳本完成，部署由使用者依 `docs/deployment.md` 操作」，「尚未部署」保留到實際部署；「開發」區塊加 `npm run smoke`（說明需先 `npm start`）；「文件」清單加 `docs/deployment.md` |
| `docs/server-api.md` | `:3`「部署見 4.1」→ 連到 `deployment.md`；`:9–10` 架構列補 `maxDuration`；`:37` XFF「部署後以 smoke `--rate-limit` R2 驗證，結果見 `deployment.md` 部署實測紀錄」；`:38` 補 Fluid compute 一句（第 6.6 節）；`:76` 平台 413 改指向 smoke A13 |
| `docs/privacy.md` | `:73` 改為「平台 log 的範圍與保留期依 Vercel 方案，見 `deployment.md` 第 7 節；實測後補」；`:83` 「留待 4.1 前處理」→ 依第 16 節第 2 點答案改寫（預設：「另開 Feature 處理，部署時仍未釘版」）；`:97` 部署項目保留；新增一句「未啟用 Vercel Web Analytics／Speed Insights」 |
| `docs/planning/epics-and-features.md` | 4.1 列改 `done`，一句結論並連到本規格；若第 16 節第 2 點決定「釘版擋部署」，在 Epic 4 新增該 Feature 列（編號依使用者決定） |

`docs/analysis-json-contract.md`、`docs/client-server-boundary.md`、`AGENTS.md` 不改。

## 12. 驗收標準

1. `vercel.json` 恰為第 6.1 節內容；兩個 route export 恰為 `POST`、`runtime = "nodejs"`、`maxDuration`（值與 Notes 中的量測結論一致）。
2. `npm run build`、`npm run lint`（含 `scripts/smoke-test.mjs`）通過；build 輸出無 `preferredRegion`／edge 相關 deprecation 警告。
3. `REQUIRE_BASELINE=1 npm test` 全過，基準不變；V1–V4 與修改後的 route 測試通過。
4. 本地 `npm start` 後 `npm run smoke` 全部 PASS（A13 為「本 API 拒絕」），exit 0；`npm run smoke -- --rate-limit` R1 在預期次數觸發 429，R2 為 INFO「本地 XFF 可偽造」。
5. 第 8 節三個「故意改錯」都會失敗並已還原。
6. `git diff --stat master -- lib public next.config.mjs` 為空；`package.json` 只多 `scripts.smoke`。
7. `docs/deployment.md` 依第 9 節完成，無任何 secret；其他文件依第 11 節更新。
8. 沒有執行任何 `vercel`、`git push` 或對外部署動作。

## 13. Verification

依 `AGENTS.md` 順序，結果寫入 Notes。

1. `npm run build`、`npm run lint`。
2. `REQUIRE_BASELINE=1 npm test` 記錄基準數值；再跑一次 `npm test`；第 8 節三個故意改錯並還原。
3. Production 本地：`npm run build && npm start`，另一終端 `npm run smoke`、`npm run smoke -- --rate-limit`（等 60 秒後再跑另一項）；附上輸出摘要。另以 `curl -i` 抽查 `/`、`/index.html`、`OPTIONS /api/analyze`，與 smoke 結果一致。
4. Playwright（對 `next start` 的 `http://localhost:3000/`）：落在 `/index.html`、console 無 error、本站資源無 4xx；模擬擷取一次 `POST /api/analyze` 200、`/api/derive` 200；切換 Profile、播放骨架、拖入影片（`#videoDropZone` drop）、匯入 walk JSON（103／361ms／96）。本 Feature 不改 UI，此步確認 production build 行為與 dev 相同。
5. 文件核對（第 11 節逐條、`docs/deployment.md` 無 secret）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 14. 風險與已知限制

- **平台事實會變**：4.5 MB、`maxDuration` 預設與上限、`x-vercel-id` 格式、Fluid compute 行為都可能調整；文件註明「以 Vercel 官方說明為準」，smoke 對這些只做 INFO 或寬鬆判斷（A13、G1、R1）。
- **限流無法在部署環境證明**：R1 只觀察到單一 instance 的行為；分散式濫用無防護（既有限制）。
- **XFF 信任**：若 R2 在部署環境 FAIL，代表 IP 可偽造、限流可被繞過，須回報並另開 `fix-`，不在 4.1 修。
- **smoke 會消耗額度**：預設 9 次 POST；與使用者正在使用頁面同時跑，可能讓使用者較早遇到 429。
- **Preview 部署無法用 smoke 驗證**：受 Deployment Protection 保護（非目標）。
- **頁面無安全標頭、第三方 CDN 未釘版**：部署後即對外暴露此現況（第 16 節第 2 點）。
- **`maxDuration` 本地不生效**：`next start` 不強制，只能靠部署後 504 行為或 build output 確認；以 V 測試與 Dashboard 顯示為準。

## 15. 待決定（start 時先採預設）

1. **區域設定位置**：`vercel.json` `regions`（**建議**）／只在 Dashboard 設定。
2. **`maxDuration`**：10 秒，依本地量測調整（**建議**）／30 秒（對齊 Client analyze 逾時）／不設定。
3. **`maxDuration` 寫法**：route segment config（**建議**）／`vercel.json` `functions`。
4. **smoke 腳本**：HTTP 層、只用內建 `fetch`、npm script 名 `smoke`（**建議**）／另加 Playwright 依賴做瀏覽器 E2E（需同意新依賴）。
5. **限流測試**：預設不跑、`--rate-limit` 開啟（**建議**）／預設執行。
6. **部署實測紀錄的寫入**：部署後以 `docs:` commit 補，不另開 Feature（**建議**）／開 `4.2 部署實測`。

## 16. 未決事項（需要使用者回答）

1. **Vercel 方案**：Hobby 還是 Pro？Hobby 依 Vercel 條款限非商業用途，Function 記憶體固定、只能單一區域（`hnd1` 單一區域不受影響）；Pro 可調記憶體與更長的 `maxDuration`。影響 `docs/deployment.md` 的平台 log 保留期與限制敘述。預設：以 Hobby 撰寫並註記 Pro 差異。
2. **第三方資源釘版／頁面安全標頭是否擋部署**：`docs/privacy.md:83` 寫「留待 4.1 前處理」，但路線圖寫「另開 Feature」。要先完成那個 Feature 再公開部署，還是接受現況先部署（文件如實記載未釘版、頁面無 CSP）？預設：不擋 4.1 的程式與文件完成；是否在那之前就公開部署由你決定，privacy 該句依答案改寫。
3. **正式網址是否寫進 repo**：部署後要把 `https://<專案>.vercel.app`（或自訂網域）寫進 README／`docs/deployment.md` 實測紀錄嗎？若 repo 公開，等於公開服務入口。預設：不寫，只用佔位符，實測紀錄只記結果。
