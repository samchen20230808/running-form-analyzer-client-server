# Current Feature: 2.2 隱私說明與文件

## Status

In Progress

## Goals

- 新增 `docs/privacy.md`（11 章節，承諾對應程式位置，與實際行為一致）
- 新增 `README.md`（版本與 `APP_CONFIG.version` 一致、文件索引、隱私／存取控制摘要）
- 更新 `docs/server-api.md`「隱私」為摘要＋連結，並修正 IP 保留描述（不再「即丟棄」）
- 程式只改註解（`access-control.js`、`http-handler.js`），行為零變更
- 新增 `tests/privacy-docs.test.js` 一致性測試

## Notes

Spec: `context/features/2-2-privacy-and-docs.md`；branch `feature-privacy-and-docs`。

**Baseline（動手前）**：`REQUIRE_BASELINE=1 npm test` 149 通過；`npm run build` 成功。

**驗證結果**：
- `npm run lint` 無問題；`npm run build` 成功（`/api/analyze` 為 `ƒ`）。
- `REQUIRE_BASELINE=1 npm test` 158 通過；不帶變數 157 通過＋1 skip（baseline 不變：walk 103／361ms／96、三份 landmarks 193／176／150）。
- 一致性測試有效性（mutation，已還原）：「30 次」→「20 次」、加回「即丟棄」、`access-control.js` 加 `console.log`、README 版本改 `V0.0`，各自使測試失敗。
- `git diff -- lib app next.config.mjs package.json`：只有 2 檔共 3 行註解變更。
- dev server 實測（埠 3001，3000 被其他程序占用）：200／400／403／首頁 200；終端機只印 `POST /api/analyze <狀態> in <ms>`，無 IP（含帶 `X-Forwarded-For: 203.0.113.9` 的請求）、body 或 landmarks 數值，與 `privacy.md` 第 5 章一致。首頁 HTML 的 script／link 皆為同源，無第三方網域。已關閉 dev server。
- Opus review：可 complete。已處理：privacy.md 補 IP 取得方式、修正「不持有參照」引用位置、補預設值說明；README 加「目標架構」；測試改用正則並擴大禁用清單、連結改比對 Markdown 語法、移除過度的 `*` 行過濾。修正後 lint 通過、`REQUIRE_BASELINE=1` 158 通過。留作日後：掃描範圍擴及根目錄檔案與 `.mjs`／`.jsx`。
- Playwright：本 Feature 無 UI／互動變更，改以 curl 檢查首頁資源（同 2.1 做法）。

## History

<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

### 2026-11-11 — Feature 0.1: 建立 repo 與工作流程

`git init`（預設分支 `master`）；建立 `AGENTS.md`、`CLAUDE.md`、`.gitignore`、feature skill（`.agents/` 為本體、`.claude/` 轉指）、`context/current-feature.md`、`docs/planning/epics-and-features.md` 與各 Feature 規格。決策：單一 Next.js 專案單一部署；JavaScript＋Vitest；同源存取控制方案 A；Client 先原樣搬入再改呼叫 Server；舊專案原樣保留。此 Feature 為啟動檔案，直接在 `master` 提交，之後的 Feature 走 branch 流程。

### 2026-11-11 — Feature 0.2: Next.js 骨架與 baseline

建立 Next.js 16.4.6（App Router、JavaScript、Node 24.x）骨架：`app/layout.js`、`app/page.js`（佔位頁）、`app/icon.svg`；Vitest 5 與 ESLint 9（Next 16 無 `next lint`，改用 `eslint .`＋`eslint-config-next/core-web-vitals`）；`lib/config.js` 只搬純資料 `APP_CONFIG`（`applyAppConfig` 留給 Epic 3、`RUNNER_PROFILES` 留給 1.1）。baseline：從舊專案複製 9 個樣本到 `.temp/json/`（不提交），`tests/baseline.test.js` 驗格式與基準步頻（walk 103；landmarks 176／150／193；`kf-*` 101 幀），路徑相對測試檔，`REQUIRE_BASELINE=1` 時缺樣本即失敗。

驗證：lint、test（7 通過、1 skip；`REQUIRE_BASELINE=1` 為 8 通過）、build 通過；dev＋Playwright console 0 error、無資源 404。Opus review 通過，已處理 5 項建議：`.gitignore` 改 `.env*`（保留 `!.env.example`）、baseline 路徑與缺樣本語意、`APP_CONFIG` 完整比對、文件狀態。已知：`npm audit` 7 項 moderate 皆為 eslint 開發期依賴 `minimatch`；`next dev` 自動追加於 `AGENTS.md` 的英文區塊予以保留；1.1 開工前須先決定「觸地 361ms／總分 96」的基準值來源。Spec: `context/features/0-2-nextjs-skeleton-baseline.md`。

### 2026-11-11 — Feature 1.1: 核心純計算模組搬成 ES module

把舊專案 vm 載入的核心搬成 `lib/core/`：`biomechanics`、`keyframes`、`landmark-extract`、`cycle-analysis`、`keyframes-builder`（由 1.2 提前），函式本體逐字照搬；每檔第一行 `import "server-only"`，`index.js` 僅匯出舊 load-core 的 9 個名稱。Vitest 用 alias 指向 `tests/stubs/server-only.js`，不新增依賴。決策：`RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 屬 Client 狀態，不搬、留 Epic 3；門檻 55／8 與 isWalking／isBiomechanicalRunner 判斷式 1.1 不合併。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 25 通過（不帶變數 24 通過、1 skip）；walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 關鍵幀字串逐字相同、三份 landmarks（193／176／150）與 client 樣本完全一致；逐字 diff 僅 import、檔頭註解與不搬的兩函式；Client Component import 核心 build 失敗（指出 server-only），Server Component 可 build 且 `.next/static` 無核心字串。無 UI／API 變更，略過 Playwright。Opus review 通過，已處理 5 項建議。已知：361ms 只證明步頻 103 路徑；`solveKinematics` 等無 baseline 覆蓋的函式僅靠逐字 diff；無 README.md；`@/` 別名未設定；舊 Client 用到的 `solveKinematics`／`normalizeCycleKeyframes`／`sampleCycleKeyframes` 去向留 3.1 決定。Spec: `context/features/1-1-core-esm-modules.md`。

### 2026-11-11 — Feature 1.2: analyze 主流程與契約 v1.0.0

把舊 `analyzeRequest`、`LIMITS`／`validateRequest` 搬成 `lib/server/analyze.js`、`validate-request.js`（server-only，核心只經 `lib/core/index.js`），`plain()` 照留；`validateAnalysisJSON` 放 `lib/contract/`（非 server-only，只 import `../config.js`）。決策：`analyzeRequest` 不做 HTTP，回傳 `{ ok, result }` 或 `invalid_request`／`payload_too_large`／`insufficient_frames`（匯出 `ANALYZE_ERRORS`），狀態碼 400／413／422 由 1.3 對應；55／8 進入 `LIMITS`；`isWalking`／`isBiomechanicalRunner` 判斷式不合併（另開 refactor）；舊契約文件複製為 `docs/analysis-json-contract.md`；刪除 `tests/helpers/landmarks-pipeline.js`，baseline 改用正式 `analyzeRequest`。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 68 通過；walk 103／361ms／96、`kf-*` 逐字相同、三份 landmarks（193／176／150）與 client 樣本 `toStrictEqual`，`validateAnalysisJSON` 無 warning、產生端義務全過；逐字 diff 僅 import、`export`、註解與回傳形狀；舊新 `analyzeRequest` 14 項對照一致；client import `lib/server` build 失敗（指出 server-only），import `lib/contract` build 成功且 bundle 無核心字串。無 UI／API 變更，略過 Playwright。Opus review 通過，已處理 import 白名單 regex、3000 幀邊界、`schemaVersion: null` 等建議。已知：`isWalking` true 分支無 landmarks 樣本，僅靠逐字 diff；`insufficient_frames` 只斷言 `acceptedFrames < 8`；55 幀停止與 `finalize` 路徑無獨立單元測試。Spec: `context/features/1-2-analyze-pipeline-contract.md`。

### 2026-11-11 — Feature 1.3: Route Handler `/api/analyze`

新增 `app/api/analyze/route.js`（只 export `runtime`、`POST`）→ `lib/server/http-handler.js`（`handleAnalyzeHttp`，框架無關）。處理順序：存取控制 → Content-Type 415 → 串流讀 body 強制 `LIMITS.maxBodyBytes` 413（`Content-Length` 只預檢，超過即 `cancel`）→ JSON 400 → `analyzeRequest`（400／413／422），非預期例外 500 `internal_error`，只 log `analyze failed`。所有回應 `Cache-Control: no-store`（`next.config.mjs` `headers()` 讓 Next 自動 405／OPTIONS 也帶），無 CORS。存取控制單一接入點 `lib/server/access-control.js`（放行 stub，status 非 400–599 視為實作錯誤回 500），Epic 2 只換此模組。新增 `docs/server-api.md`。決策：Content-Type 嚴格比對 media type（與舊 Server 唯一刻意差異）；其餘安全標頭留 2.1；405 交給 Next。

驗證：lint、build 通過（`/api/analyze` 為 `ƒ`）；`REQUIRE_BASELINE=1 npm test` 105 通過（不帶變數 103＋1 skip）；walk 103／361ms／96、`kf-*` 逐字相同、三份 landmarks 經 `POST` 193／176／150 且與 `analyzeRequest` `toStrictEqual`；舊新 handler 13 案例對照一致；curl 200／400／415／422／413（兩條路徑）／405／OPTIONS 符合，`.next/static` 無核心字串。Playwright 因瀏覽器被占用，經使用者同意以 curl 驗證首頁與資源皆 200。Opus review 通過，已處理 status 防呆與測試強化。已知：Vercel 4.5 MB 平台上限待 4.1 實測；2.1 存取控制須留在 route 內，不要用 `proxy.js`；walk 樣本無 landmarks，無法經 route；`.gitignore` 加 `.vitest/`。Spec: `context/features/1-3-api-analyze-route.md`。

### 2026-11-11 — Feature 2.1: 同源存取模型

`lib/server/access-control.js` 由放行 stub 換成方案 A：Origin／`Sec-Fetch-Site` 檢查（`same-origin`／`none` 放行；其他值 403；無 `Sec-Fetch-Site` 時比對 `Origin` host 與 `Host`；兩者皆無放行）＋每 IP 固定視窗限流（60 秒 30 次，超過 429＋`Retry-After`）。先檢查 Origin 再計數，被拒的跨站請求不耗額度。IP 取 XFF 第一段 → `x-real-ip` → 共用桶 `unknown`；最多追蹤 10,000 筆，滿時先清過期、再擠最早開窗者（重開窗先 delete 再 set）。常數 `ACCESS_LIMITS` 不放 `APP_CONFIG`、不讀 env。`RESPONSE_HEADERS` 與 `next.config.mjs headers()` 補齊 5 個安全標頭（測試比對一致），無 CORS。`route.js` 不改；`http-handler.js` 只改 `RESPONSE_HEADERS`。`docs/server-api.md` 如實記載限流僅盡力而為。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 149 通過（不帶變數 148＋1 skip）；walk 103／361ms／96、三份 landmarks 193／176／150 不變；curl 實測 200／403／429／405／204 與標頭符合。Playwright 因瀏覽器被占用，經使用者同意以 curl 驗證首頁與資源；真實瀏覽器同源 `fetch` 非 403 的驗證留待 Epic 3。Opus review 通過，已補強清理測試（mutation 驗證）、403 標頭與 `Retry-After` 斷言。已知：多 instance／冷啟動使限流僅盡力而為；XFF 可信度依賴 Vercel 為最外層，4.1 部署後實測；`Host` 帶預設 port 時舊 Safari 可能誤拒；IPv6 未以 /64 限流。Spec: `context/features/2-1-same-origin-access-control.md`。
