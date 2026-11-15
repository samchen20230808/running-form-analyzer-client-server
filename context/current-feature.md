# Current Feature: 5.4.2 手機版 Logo 固定與相位標題單行

## Status

In Progress

## Goals

- 核心二 `#simPhaseTitle` 固定單行（nowrap＋ellipsis），`#simHud` 高度與 `#simCanvas` 位置不再隨相位文字變動（地板不跳）。
- Logo（`#appHeader`）與常駐區（`#mobileBar`）一起固定在頂端，核心一／核心二／分析三個分頁一致；從分析切回核心不再出現空白。
- `#mobileBar` 的 `top` 由 `mobile-shell.js` 依 Logo 高度設定（`leave()` 時清除）；`#analysisActions` 的 `scrollMarginTop` 含 Logo 高度。
- 行為不變：`lib/**`、`app/**`、API、其他 JS、桌面與平板版面、`APP_CONFIG`、baseline（103／361ms／96）。

## Notes

- Branch：`fix-mobile-sticky-logo`；規格：`context/features/5-4-2-mobile-sticky-logo-sim-hud.md`。
- 範圍：`public/styles/main.css`（僅 5.4 區段）、`public/js/mobile-shell.js`、`public/index.html`（版號 `?v=5.4.2`）、`tests/legacy-client.test.js`（W6 版號、新增 N6）、`docs/planning/epics-and-features.md`（新增 5.4.2，planned）。
- Baseline（動手前）：`npm run build` 成功；`npm run lint` 無錯誤；`REQUIRE_BASELINE=1 npm test` 15 檔 353 通過。
- 實作：5.4 區段加 `#appHeader { position: sticky; top: 0; z-index: 41; background: #0b0f19 }`（置於檔尾，覆蓋 5.1 的 static）；`#simHud` flex-wrap nowrap；`#simPhaseTitle` nowrap／ellipsis／min-width 0／flex 1 1 auto；`#simPctText` flex 0 0 auto。`#simPhaseTitle` computed 字級實測 11px，5.4 字級有生效，無需另修。`fitCore()` 設 `mobileBar.style.top`，`leave()` 清除，`fitAnchorMargin()` 含 header 高。
- 驗證結果（改完後）：build 成功（改完後重跑）、lint 無錯誤、`REQUIRE_BASELINE=1 npm test` 15 檔 354 通過（含新增 N6），基準 103／361ms／96 不變。
- Playwright 觸控模擬（`isMobile`＋`hasTouch`，`pointer: coarse` 為 true），尺寸 412×737／390×700／375×667／360×740，以「預覽徐國峰標準動作」資料進入核心二（未實際載入影片擷取）：
  - 地板穩定：四顆相位按鈕（0／15／30／55）`#simHud` 高度皆 25.6、`#simCanvas` top 230.3 與 height 完全相同（412：308.6／390：271／375：238.2／360：311）；`#simPhaseTitle` 高 16.5（單行），字級 11px。
  - Logo 固定：初始、按分析、分析區再捲 800px、切核心一、分析後切回核心二，`#appHeader` top 皆 0（高 58.1）、`#mobileBar` top 58～58.1、`style.top` 為 58px；切回核心二主題卡片 top 229.5，底部 412:730.1／390:692.5／375:659.7／360:732.5，皆 ≤ 視窗高，無空白、scrollY 0。
  - 按分析後 `#analysisActions` top 229.3 ≥ 常駐區底部 221.4（未被蓋住），分頁高亮為「分析」；切回核心後高亮為對應核心。
  - 無橫向溢出、console 0 error、無 4xx。
  - 1440：`#appHeader` sticky（Tailwind 類別，與原本相同）、`#mobileBar` 隱藏、無 inline top；768 觸控：`#appHeader` static、`#mobileBar` 隱藏、無 inline top、無溢出。390→1440→390：回桌面時 `style.top` 與 scrollMarginTop 清空，回手機後 58px／229px。
  - ⚙ 設定面板開啟正常（覆蓋全螢幕含 Logo 區）；步幅彈出面板位於常駐區下方；匯入 walk JSON 步頻 103；`/api/derive` 200。
- 截圖（scratchpad `542/`）：`two-initial-*.png`、`phase-phaseBtn{0,15,30,55}-*.png`、`analysis-*.png`、`back-two-*.png`（尺寸 412／390／375／360）、`settings-390.png`、`popover-390.png`、`analysis-json-390.png`。
- 未做／未驗：真實影片載入與擷取（改用預覽資料）、`/api/analyze` 狀態碼（本次流程只見 derive 200）、實機 iOS／Android、播放中多次取樣（僅相位按鈕切換）。

**Review（Opus）**：Ready to complete。目標全部達成；diff 只動 5.4 CSS 區段、`mobile-shell.js` 三處（`fitCore` 設 `#mobileBar` top、`leave` 清除、`fitAnchorMargin` 含 Logo）、版號與測試，無 scope creep。review 時發現並修正：分析區捲動時 Logo 與常駐區交界出現 1px 橘線（Logo 實高 58.1、常駐區 top 58 的小數像素縫隙，捲到下方的內容透出），於 `#appHeader` 加 `box-shadow: 0 1px 0 #0b0f19` 蓋住，Playwright 觸控 412×737 截圖確認消失、切回核心二卡片底部 730 ≤ 738、console 0 error；lint 通過、`REQUIRE_BASELINE=1 npm test` 354 通過。相位標題切換即改寫 `#simPhaseTitle`，相位按鈕測試等同涵蓋播放中的標題變化。

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
