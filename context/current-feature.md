# Current Feature: 1.1 核心純計算模組搬成 ES module

## Status

In Progress

## Goals

- 把舊專案 vm 載入的核心搬成 `lib/core/*.js` ES module（biomechanics、keyframes、landmark-extract、cycle-analysis、keyframes-builder），函式本體逐字照搬，零行為變更。
- 每個核心檔第一行 `import "server-only"`；`lib/core/index.js` 只匯出舊 load-core 的 9 個名稱。
- Vitest 以 alias＋空 stub 處理 `server-only`，不新增依賴。
- baseline 逐值一致：walk 步頻 103／觸地 361ms／總分 96、`kf-walk-101`／`kf-hsu-101` 關鍵幀字串相同、三份 landmarks 步頻 193／176／150 且與 client 樣本相同。
- 驗證核心不進瀏覽器 bundle；同步路線圖與 `lib/config.js` 註解。

## Notes

規格：`context/features/1-1-core-esm-modules.md`（Opus 撰寫）。依 5 項待決定事項的建議執行，**尚待使用者確認**：
1. `RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 不搬，改到 Epic 3。
2. 55／8 與 isWalking／isBiomechanicalRunner 判斷式 1.1 不合併。
3. `keyframes-builder` 由 1.2 提前到 1.1。
4. 子模組匯出所有搬入函式。
5. `server-only` 用 Vitest alias＋空 stub，不安裝套件。

Baseline（動手前）：`npm run build` 成功；既有測試 7 通過、1 skip。

驗證結果：
- `npm run lint` 無錯誤；`npm run build` 成功。
- `REQUIRE_BASELINE=1 npm test`：3 檔 25 通過；不帶變數 24 通過、1 skip（被 skip 的是 REQUIRE 那組；「缺樣本時整組 skip」依 `skipIf(!available)` 程式邏輯判定，未實際改名資料夾測試）。
- 逐字審查：新檔去掉 import／export 前綴後與舊檔 diff，差異僅有 import 行、檔頭註解，以及不搬的 `evaluateProfileCycle`／`getActiveRunnerTiming`。
- bundle：暫時讓 `"use client"` 元件 import 核心 → build 失敗且訊息指出 `server-only`；暫時讓 Server Component import → build 成功，核心字串只在 `.next/server`、`.next/static` 搜尋不到。兩項暫時修改已還原，`app/` 無變更。
- 無 UI／API 變更，略過 Playwright。
- Opus review：計算邏輯無改變，已修 5 項（檔頭註解殘留舊架構描述、`CYCLE_KEYFRAME_NUMERIC_FIELDS` 欄位順序斷言、`lib/config.js` 註解、本段措辭、路線圖補條目）。已知證明力限制：walk 的 361ms 只證明步頻 103 路徑（步頻 < 135 時只用步頻計算），summary 相關證據是總分 96；landmarks 的關鍵幀比對為同程式自比，真正證據是 kf-walk／kf-hsu 逐字比對。`@/` 別名尚未設定，目前只能用相對路徑；不經 Next 打包而直接用 node 執行 import `lib/core` 的腳本會因找不到 `server-only` 失敗。
- 未做：專案尚無 `README.md`，未新增測試段落；`solveKinematics` 等無 baseline 覆蓋的函式只靠逐字 diff 保證，未補對照值。

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
