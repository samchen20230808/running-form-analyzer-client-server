# Current Feature: 1.3 Route Handler `/api/analyze`

## Status

In Progress

## Goals

- `app/api/analyze/route.js`（POST、nodejs）只轉呼叫 `lib/server/http-handler.js` 的 `handleAnalyzeHttp`
- 串流讀 body，以 `LIMITS.maxBodyBytes` 強制上限（不只信 Content-Length）→ 413
- 錯誤對應：Content-Type 415、JSON 解析失敗 400、`invalid_request` 400、`payload_too_large` 413、`insufficient_frames` 422、非預期例外 500（不回 stack）
- 所有回應 `Cache-Control: no-store`，無 CORS；非 POST 由 Next 回 405
- `lib/server/access-control.js` 作為存取控制單一接入點（放行 stub），讀 body 前執行
- 測試：`tests/api-analyze-route.test.js`、baseline 三份 landmarks 經 POST 逐值一致、core-modules import 限制
- 新增 `docs/server-api.md`，更新路線圖

## Notes

Spec: `context/features/1-3-api-analyze-route.md`。待決定事項採規格建議：1=A（walk 沿用既有測試）、2=A（Content-Type 嚴格比對）、3=只加 Cache-Control、4=A（Next 自動 405）、5=做舊新對照。

### Baseline（開工前）
- `npm run build` 成功（`/`、`/_not-found`、`/icon.svg` 皆靜態）
- `REQUIRE_BASELINE=1 npm test`：5 檔 68 通過

### 驗證結果
- `npm run lint` 無錯誤；`npm run build` 成功，路由表 `/api/analyze` 為 `ƒ`（動態）
- `REQUIRE_BASELINE=1 npm test`：6 檔 105 通過（開工前 68；Opus review 後補強測試與 `checkAccess` status 防呆）；不帶變數 103 通過、1 skip；無 `.temp` 時 route 測試照常執行（87 通過、17 skip）
- walk 103／361ms／96、`kf-*` 逐字相同（既有測試）；三份 landmarks 經 `POST` 為 193／176／150，metrics 與基準一致，去 `timestamp` 後與 `analyzeRequest` `toStrictEqual`、key 順序相同，`validateAnalysisJSON` 無 warning
- 舊新對照（scratchpad 一次性腳本，舊 `handleAnalyzeHttp` dev-open vs 新 `POST`，13 案例）：狀態碼與 body 完全一致（舊 handler 以 `process.cwd()` 載核心，比對時暫時切 cwd）
- curl（dev，埠 3001）：200／400（非法 JSON、`{}`）／415／422／413（Content-Length 預檢與 chunked 串流計數兩條路徑）皆符合；GET／PUT／DELETE 405 與 OPTIONS 204（`allow: OPTIONS, POST`）都帶 `Cache-Control: no-store`；無 `Access-Control-*`、無 `X-Powered-By`；dev log 無錯誤
- `.next/static` 搜尋不到核心字串與 `analyze failed`
- Playwright：瀏覽器被其他實例占用（重試仍失敗），經使用者同意以 curl 替代；curl 驗證 `/` 與全部資源皆 200；無互動變更，略過第 4 項。dev server 已關閉

### 決策與備註
- 待決定事項採規格建議；Content-Type 嚴格比對是與舊 Server 唯一刻意差異（已寫入 `docs/server-api.md`）
- walk 樣本無 landmarks，無法經 route；route 層以三份 landmarks 證明
- `.gitignore` 加 `.vitest/`（RTK 包裝 vitest 時產生的 JSON 報告）
- 路線圖 1.3 暫標 `in progress`，complete 時改 `done`
- 已知：Vercel 4.5 MB 平台上限待 4.1 實測；2.1 存取控制須留在 route 內（`access-control.js`），不要放 `proxy.js`

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
