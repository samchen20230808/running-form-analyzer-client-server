# Current Feature: 5.2 PWA

## Status

In Progress

## Goals

- `app/manifest.js` 與 `index.html` `<head>` 標籤（manifest、theme-color、apple-touch-icon）
- 圖示 192／512／maskable／apple-touch-icon（不新增依賴）
- `public/sw.js`：殼層 cache-first、CDN 執行期 SWR、`/api/*` 與非 GET 不攔截
- `public/js/pwa.js`＋`#swUpdateToast`：提示後更新
- `scripts/sw-shell-lib.mjs`、`scripts/sync-sw.mjs`、`npm run sync:sw`
- `next.config.mjs` 新增 `/sw.js` 標頭（no-cache）
- `tests/pwa.test.js`（Q1–Q9）、文件同步（privacy、deployment、README、roadmap）

## Notes

- 規格：`context/features/5-2-pwa.md`（Opus 寫 spec；使用者決定：CDN 執行期快取、提示後更新）。
- Baseline（動手前）：`npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 15 檔 354 通過。
- 圖示產生：headless Edge 截圖（`msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --window-size=N,N --screenshot=… file:///<img 暫存 HTML>`），來源 `app/icon.svg`、`scripts/pwa-icons/icon-maskable.svg`；目測 512 與 maskable 正確。
- 驗證結果：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 16 檔 369 通過（新增 `tests/pwa.test.js` Q1–Q9＋Q1b），基準不變。故意改錯：改 `APP_VERSION` → Q1／Q4 失敗；改 `ui.js` 不 sync → Q3 失敗（訊息含 npm run sync:sw）；移除 `/api/` 判斷 → **未失敗**（該判斷在結構上冗餘：`/api/*` 不在 PRECACHE，本來就不會被攔截，仍保留作明示）。
- 為 sw.js 的 `fetch(request)` 調整 `tests/legacy-client.test.js` U2（略過 `public/sw.js`），改由 `pwa.test.js` Q1b 要求其 `fetch` 引數只能是 `request`。
- 生產模式（`next start -p 3100`；3000 埠被其他行程占用，未動它；Playwright MCP 瀏覽器被占用，改用 npx 快取的 playwright-core 腳本，腳本在 scratchpad）：C1 `/sw.js` 200＋`no-cache`＋JS、manifest `application/manifest+json`、圖示 200、`/api/analyze` GET 405＋`no-store`；C2 scope `/`、殼層快取 27 項、首次無提示、console 0 error、無 4xx；C3 `getInstallabilityErrors` 與 manifest errors 皆空；C4 第二次載入受控，`rfa-cdn-V4.0` 存 33 筆第三方；C5 離線 `/index.html?sw=1`、`/?sw=1`：標題、`#appHeader`、`window.RFA`、Tailwind、背景色皆正常，console 僅 `net::ERR_INTERNET_DISCONNECTED`（第三方未快取資源）；C6 POST `/api/derive` 不經 SW、任何快取皆無 `/api/`；C8 改 sw 位元組後出現提示（390 寬 x16、寬 358、高 134）、稍後→隱藏且 waiting 仍在、重新整理→恰好 reload 一次、waiting 清除；C9 無參數 localhost 不註冊；C10 1440／390 無橫向溢出、0 error、0 4xx。已還原測試用的 sw.js 改動並重跑 `sync:sw`。
- 未驗：真實影片擷取後離線 MediaPipe（C7）、匯入 walk JSON 步頻 103（UI 互動未改，單元基準通過）、768 寬、實機 Android／iOS／桌面安裝（規格第 11 節，需 HTTPS 部署，由使用者操作）。
- 文件：README、`docs/deployment.md` 第 12 節、`docs/privacy.md` 第 8／9 節、roadmap 5.2 說明（狀態待 complete 改 `done`）。

## History

<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

### 2026-11-15 — Fix 5.4.1: 手機觸控空狀態與相位按鈕修正

實機回報（Android 412×737、觸控）：核心一空狀態提示與「選擇影片檔」被 `#videoHud` 蓋住、預覽鈕被裁，起因是觸控裝置多出的「📹 拍攝影片」按鈕；核心二「2. 關鍵跑姿」換行。只改 `main.css` 5.4 區段：空狀態時隱藏 HUD（`#videoEmptyOverlay:not(.hidden) ~ #videoHud`）、隱藏疊層內兩個上傳 label（標題列已有）、上內距 56→12px、相位標籤 nowrap／11px；`#dropHintTouch` 改「點按鈕選擇或拍攝跑步影片」；快取版號 `main.css?v=5.4.1`；W6 版號、新增 N5。JS、`lib/`、API、桌面與平板零變更。Spec: `context/features/5-4-1-mobile-empty-state-fix.md`（Opus 寫 spec／review，Sonnet 實作）。

驗證：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 353 通過，基準 103／361ms／96 不變；Playwright 觸控模擬（`isMobile`＋`hasTouch`，確認 `pointer: coarse`）412×737／390×700／375×667／360×740：空狀態無 HUD、無 label、提示與預覽鈕不重疊且在影片區內、卡片底部 ≤ 視窗，載入影片後 HUD 恢復，相位按鈕等高單行，無橫向溢出、console 0 error；1440／768（含觸控）不變；預覽播放、匯入 walk JSON 步頻 103、analyze／derive 200。未驗：實機 iOS／Samsung Internet、淺色主題、標題列上傳實點；360 寬相位標題列仍換行（留給 5.5）。

### 2026-11-15 — Fix 5.4.2: 手機版 Logo 固定與相位標題單行

實機回報：核心二相位標題（`#simPhaseTitle`）在「落下」等長文字時換兩行，`#simHud` 變高擠壓 `#simCanvas`，地板線忽上忽下；按「分析」會捲走 Logo、從分析切回核心時 Logo 仍不見且卡片下方多約 66px 空白。使用者決定「Logo 跟常駐區一起固定」。`main.css` 5.4 區段：`#appHeader` sticky（z 41、不透明底、1px 同色陰影蓋住 58.1／58px 小數縫隙）、`#simHud` nowrap、`#simPhaseTitle` 單行 ellipsis；`mobile-shell.js`：`fitCore` 設 `#mobileBar` top＝Logo 高、`leave` 清除、`fitAnchorMargin` 含 Logo；版號 `?v=5.4.2`；W6、新增 N6。其他 JS、`lib/`、API、桌面與平板零變更。Spec: `context/features/5-4-2-mobile-sticky-logo-sim-hud.md`（Opus spec／review，Sonnet 實作）。

驗證：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 354 通過，基準不變；Playwright 觸控模擬 412×737／390×700／375×667／360×740：四相位切換 `#simHud` 高 25.6、`#simCanvas` top 230.3 完全不變，標題單行；初始／分析／分析下捲 800px／切回核心一／二 Logo top 0、常駐區 top 58，切回核心卡片底部 ≤ 視窗；分析區頂端不被蓋住、高亮正確；1440／768 不變、390↔1440 縮放清除 inline 值；⚙ 面板、步幅面板、匯入 walk JSON 步頻 103、derive 200；console 0 error。未驗：真實影片擷取（用預覽資料）、`/api/analyze`、實機 iOS／Android。
