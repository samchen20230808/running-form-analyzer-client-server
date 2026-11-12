# Current Feature

## Status

Not Started

## Goals

<!-- Goals appear here after /feature load -->

## Notes

<!-- Notes appear here after /feature load -->

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

### 2026-11-12 — Feature 3.9: 頁面改為根路徑 /index.html

把舊 Client 的 `index.html`、`js/`、`styles/`、`modules/` 用 `git mv` 從 `public/legacy/` 搬到 `public/` 根目錄（除 `index.html` 4 個 temp-core `src` 改為 `legacy/temp-core/…` 外，內容逐位元組不變）；暫時核心留在 `public/legacy/temp-core/`，部署防線不動。`/` 仍 307 轉址，目的地改 `/index.html`，舊 `/legacy/index.html` 不保留（404）。同步腳本目的地改 `public/modules/`，lint 忽略改三個明確目錄；測試改新路徑並新增 E1–E3（目錄結構、temp-core 引用、轉址）；同步 README、privacy、boundary、路線圖與 `AGENTS.md:62` 的 `public/js/config.js`。另有獨立 `fix:`：核心二骨架頭被圖例遮住，`groundY` 402→462、畫布高 420→480。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 188 通過，基準 103／361ms／96 不變；`VERCEL=1` build 仍失敗（仍不可部署）；故意改錯 E2／B1 均會失敗並已還原；curl：`/` 307、`/index.html` 200、舊路徑 404、資源 200；Playwright 無 console error、無 404、`window.RFA` 已掛。Opus review：零行為變更、測試有效。未驗：影片擷取、切 Profile、拖入影片等互動（檔案內容與 3.4 相同）、bundle 核心字串掃描、UI 修正僅看單一相位。Spec: `context/features/3-9-root-index-html.md`。
