# Current Feature: 0.2 Next.js 骨架與 baseline

## Status

In Progress

## Goals

- 根目錄建立 Next.js（App Router、JavaScript）：`package.json`（`engines.node` 24.x，next 16.4.6、react 19.3.1）、`next.config.mjs`、`app/layout.js`、`app/page.js`（佔位頁）。
- 加入 Vitest：`npm test` 可執行，含一個冒煙測試。
- 建立 `lib/config.js`（`APP_CONFIG`，由舊專案 `js/config.js` 搬入並改為 ES module；值不變、載入時不存取 DOM）。
- 建立 baseline 機制：樣本由舊專案 `.temp/json/` 複製到本專案 `.temp/json/`（不提交，複製前先列清單讓使用者確認無個資）；`tests/baseline.test.js` 骨架：樣本不存在時 skip 並說明，存在時驗證檔案格式（不跑核心）。
- `npm run dev`／`npm run build`／`npm test` 皆成功；加 ESLint（預設設定）。

## Notes

已決定（使用者「照建議」）：fixtures 不提交，維持 `.temp/`；ESLint 用預設設定；版本沿用舊 `server/package.json`（next 16.4.6、react 19.3.1）。
範圍外：核心演算法搬遷（Epic 1）、API（1.3）、存取控制（Epic 2）、Client UI（Epic 3）。
驗證：build、test、dev＋Playwright 無 console error、`git status` 乾淨（`.temp/` 未提交）。
Spec: `context/features/0-2-nextjs-skeleton-baseline.md`。

### Baseline 與實作紀錄（start）

- Branch：`feature-nextjs-skeleton-baseline`；Node v24.14.0、npm 11.9.0。實作前專案為空，無改前 build 基準。
- 樣本：從舊專案 `.temp/json/` 複製 9 個到 `.temp/json/`（`client-*` 3、`landmarks-*` 3、`kf-*-101` 2、walk summary 1）；不含 `rec-*`、`server-*`、截圖、`orig.html`。僅 walk summary 的 `profileName` 含時間戳檔名，其餘為純數值。
- 基準值（來自樣本）：walk 步頻 103；landmarks 的 client 步頻 walkrun-a 176、walkrun-b 150、woman03 193；`kf-walk/hsu-101` 的 `cycleKeyframes.frames` 皆 101 幀。
- 範圍調整：`lib/config.js` 只搬純資料 `APP_CONFIG`（含 `analysisSchemaVersion`）。`applyAppConfig`（寫 DOM）留待 Client UI（Epic 3）；`RUNNER_PROFILES`（`evalCycle` 依賴 `evaluateProfileAngles`）留待 1.1。
- ESLint：Next 16 已無 `next lint`，改用 `eslint .` 加 `eslint-config-next/core-web-vitals` 預設設定。
- `next dev` 自動在 `AGENTS.md` 末端加入 Next.js 提醒區塊（指向 `node_modules/next/dist/docs/`），予以保留。
- 加 `app/icon.svg`：首次載入有 `favicon.ico` 404。

### 驗證結果

- `npm run lint`：無問題。
- `npm test`：2 檔、7 通過、1 skip（「樣本缺少」提示，樣本存在時預期 skip）。
- `npm run build`：成功，`/` 與 `/_not-found` 靜態輸出。
- `npm run dev`（port 3100）＋ Playwright：首頁標題「AI 跑姿生物力學與骨架循環分析系統 V3.29」；加 icon 後 console 0 error／0 warning，無資源 404。
- `git status`：未追蹤項目不含 `.temp/`、`.next/`、`node_modules/`。
- 已知：`npm audit` 7 項 moderate，皆為 eslint 開發期依賴 `minimatch`，不進 production，暫不處理。
- 未涵蓋：互動走查（本 Feature 無互動）；核心比對（1.1 起）。

## History

<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

### 2026-11-11 — Feature 0.1: 建立 repo 與工作流程

`git init`（預設分支 `master`）；建立 `AGENTS.md`、`CLAUDE.md`、`.gitignore`、feature skill（`.agents/` 為本體、`.claude/` 轉指）、`context/current-feature.md`、`docs/planning/epics-and-features.md` 與各 Feature 規格。決策：單一 Next.js 專案單一部署；JavaScript＋Vitest；同源存取控制方案 A；Client 先原樣搬入再改呼叫 Server；舊專案原樣保留。此 Feature 為啟動檔案，直接在 `master` 提交，之後的 Feature 走 branch 流程。
