# Current Feature: 3.9 頁面改為根路徑 /index.html

## Status

In Progress

## Goals

- `GET /index.html` → 200（舊 Client），`GET /` → 307 `Location: /index.html`，`/legacy/index.html` → 404
- `git mv` 把 `index.html`、`js/`、`styles/`、`modules/` 從 `public/legacy/` 搬到 `public/`（內容不變）；`public/legacy/temp-core/` 不動
- `index.html` 的 4 個 temp-core `src` 改為 `legacy/temp-core/…`（行數不變）
- `next.config.mjs` 轉址目的地改 `/index.html`；`eslint.config.mjs` 忽略清單、`scripts/sync-legacy-modules.mjs` 目的地（`public/modules`）同步
- 測試改新路徑並新增 E1–E3；基準 103／361ms／96 不變
- 文件同步（README、docs/privacy.md、docs/client-server-boundary.md、路線圖 3.9 列）

## Notes

- Spec: `context/features/3-9-root-index-html.md`（Opus 撰寫）
- 未決事項採預設：不保留 `/legacy/index.html` 相容轉址；`AGENTS.md:62` 路徑修改待使用者同意（暫不改）
- 仍不可部署（temp-core 與部署防線保留）

驗證結果：
- Baseline（動工前）：build 成功、`REQUIRE_BASELINE=1 npm test` 185 通過
- 完成後：lint 無錯；build 成功；`VERCEL=1 npm run build` 仍失敗（訊息含 temp-core）；`REQUIRE_BASELINE=1 npm test` 188 通過（新增 E1–E3），基準 103／361ms／96 不變；`npm run sync:legacy` 後無內容差異
- `git diff -M`：15 個檔案，除 `index.html` 4 行 `src` 外皆 100% rename；temp-core、lib、app、package.json 未動
- curl：`/` 307→`/index.html`；`/index.html` 200；`/legacy/index.html`、`/legacy/js/*` 404；`/js`、`/styles`、`/modules`、`/legacy/temp-core` 資源 200，JS 為 application/javascript
- Playwright：`/` 落在 `/index.html`；本站資源皆 200、無 404；console 0 error（僅 Tailwind CDN warning）；`window.RFA` 存在且 frozen
- 故意改錯：`index.html` 一個 src 改回 `temp-core/` → E2 與載入測試失敗；改 `lib/player/stride-input.js` → B1 失敗並提示 `npm run sync:legacy`；皆已還原。不帶變數 `npm test` 187 通過、1 skipped（baseline 未強制）。`/legacy/modules/bridge.js` 404
- 順手 UI 修正（使用者回報，應拆獨立 `fix:` commit）：核心二骨架頭被圖例遮住 → `public/js/renderer.js` `groundY`／`badgeY` 402→462，`public/index.html` simCanvas 高 420→480；Playwright 截圖確認，僅看單一相位
- Opus review：搬移零行為變更、測試有效；已補 boundary 文件對 temp-core 檔頭過時的註記。README「3.1–3.4 完成」待 complete 時更新
- 未驗：影片擷取、切 Profile、播放、拖入影片等互動（檔案內容與 3.4 逐位元組相同，僅路徑變動）；bundle 核心字串掃描
- 待使用者決定：`AGENTS.md:62` 的 `public/legacy/js/config.js` 改為 `public/js/config.js`（未改）；temp-core 檔頭「只由 public/legacy/index.html 載入」已過時（不得修改，3.7 刪除）

## History


<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

### 2026-11-12 — Feature 3.4: 瀏覽器共用模組與橋接

把必須在瀏覽器執行的純函式從 server-only 的 `lib/core/` 搬成單一來源：`lib/player/`（`normalizeCycleKeyframes`／`sampleCycleKeyframes`／常數、`solveKinematics`、`parseManualStrideValue`）與 `lib/landmarks/`（`extractAnglesFromLandmarks`／`evaluateCaptureFrame`），函式本體逐字照搬；`lib/core/` 改由它們轉匯出，`index.js` 的 9 個名稱不變，刪除 `lib/core/landmark-extract.js`。橋接：`npm run sync:legacy`（`scripts/sync-legacy-modules.mjs`，含 import 自我檢查）複製到 `public/legacy/modules/`（提交進 git），手寫 `modules/bridge.js` 掛 `window.RFA`，`index.html` 同行載入；舊 UI 6 組呼叫點同行改用 `RFA.*`。`evaluateProfileAngles` 因退回分支需 server-only 函式，留 3.5。temp-core 與部署防線保留（仍不可部署）。新增 `tests/browser-modules.test.js`，補強 `legacy-client`／`core-modules` 測試；同步文件與路線圖，並新增 3.9（頁面改為根路徑 `/index.html`）。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 185 通過；基準不變（103／361ms／96；193／176／150）；改 `lib/player` 一字元，同步測試失敗並提示指令；`.next/static` 無核心字串；`/legacy/modules/*.js` 200 JavaScript MIME；Playwright console 0 error，三個 profile × 101 點 `solveKinematics` 與 temp-core 全域版相等，woman03 擷取 1 個 POST、101 幀，切 Profile、播放、相位、圖層、匯入 JSON、手動步幅可用。Opus review：程式可 complete，已修文件同步與 import 檢查漏洞。已知：拖入影片、模擬擷取、壞關鍵幀退回、`DOMContentLoaded` 時 `RFA` 存在未直接驗；壞資料測試僅 `{}`／`null`；C4 字串清單只用 4 個；`sync:legacy` 需手動執行，dev 不會自動同步；AGENTS.md 同步規則待使用者決定。Spec: `context/features/3-4-browser-shared-modules-bridge.md`。
