# Current Feature: 1.2 analyze 主流程與契約 v1.0.0

## Status

In Progress

## Goals

- 把 `analyzeRequest`、`LIMITS`／`validateRequest` 照原樣搬成 `lib/server/*.js`（server-only），改經 `lib/core/index.js` 使用核心；`plain()` 照留，零行為變更。
- `analyzeRequest` 不做 HTTP，回傳 `{ ok: true, result }` 或 `{ ok: false, error, … }`（`invalid_request`／`payload_too_large`／`insufficient_frames`），狀態碼由 1.3 對應。
- 搬入 `validateAnalysisJSON` 至 `lib/contract/`（非 server-only，只 import `../config.js`），用來驗證回應符合契約 v1.0.0；`schemaVersion` 維持 `1.0.0`。
- `baseline.test.js` 改用正式 `analyzeRequest`（walk 103／361ms／96；landmarks 193／176／150 與 client `toStrictEqual`），刪除 `tests/helpers/landmarks-pipeline.js`。
- 55／8 進入 `LIMITS`；`isWalking`／`isBiomechanicalRunner` 判斷式不合併，只記錄。
- 複製舊契約文件為 `docs/analysis-json-contract.md`（加說明與修訂紀錄）。

## Notes

Spec: `context/features/1-2-analyze-pipeline-contract.md`。待決定事項 1～6 皆採規格建議（A／A／複製契約／不合併／產生端義務失敗只記錄／做舊新對照）。

### Baseline（開工前，branch `feature-analyze-pipeline-contract`）

- `npm run build` 成功。
- `REQUIRE_BASELINE=1 npm test`：3 檔 25 通過。

### 驗證結果（實作後）

- lint 無問題、`npm run build` 成功。
- `REQUIRE_BASELINE=1 npm test`：5 檔 66 通過；不帶變數 65 通過、1 skip（baseline 樣本存在檢查）。walk 103／361ms／0／96、`kf-*` 逐字相同、三份 landmarks 經正式 `analyzeRequest`：193／176／150，summary 與 client `toStrictEqual`，metrics 193/118/66、192/149/90、230/170/75，`isWalking` 皆 false；`validateAnalysisJSON` 無 warning；`expectProducerContract` 全過（舊核心輸出符合產生端義務，無需記錄例外）。
- 逐字 diff：`validate-request.js` 僅檔頭註解與 `import "server-only"`；`validateAnalysisJSON` 僅加 `export`；`analyze.js` 僅 import、`ANALYZE_ERRORS`、註解與回傳形狀。
- 舊新完整對照（scratchpad 一次性腳本，未提交；`--pool=forks`＋`chdir` 舊 `server/`）：三份 landmarks 各兩種請求（含 `profileName`／`heightCm`／`cameraMode`），去除 `timestamp` 後 JSON 字串完全相同；11 個錯誤案例狀態碼對應與 `details`／`acceptedFrames` 相同（413 不帶 details）。14 項全過。
- bundle：`"use client"` import `lib/server/analyze.js` → build 失敗並指出 `server-only`；Server Component import `LIMITS` ＋ Client import `lib/contract/validate-analysis-json.js` → build 成功，`.next/static` 無核心字串、契約驗證字串存在。已還原 `app/`。
- 無 UI／API 端點變更，略過 Playwright 與 curl。`tests/helpers/` 已移除，無殘留引用（僅歷史文件提及）。
- 已知：`isWalking` true 分支與步頻 < 135 判定為跑者的分支無 landmarks 樣本，僅靠逐字 diff；判斷式合併另開 refactor。路線圖 1.2 狀態標為 in progress，complete 時改 done。

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
