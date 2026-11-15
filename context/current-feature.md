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

### 2026-11-15 — Fix 5.4.1: 手機觸控空狀態與相位按鈕修正

實機回報（Android 412×737、觸控）：核心一空狀態提示與「選擇影片檔」被 `#videoHud` 蓋住、預覽鈕被裁，起因是觸控裝置多出的「📹 拍攝影片」按鈕；核心二「2. 關鍵跑姿」換行。只改 `main.css` 5.4 區段：空狀態時隱藏 HUD（`#videoEmptyOverlay:not(.hidden) ~ #videoHud`）、隱藏疊層內兩個上傳 label（標題列已有）、上內距 56→12px、相位標籤 nowrap／11px；`#dropHintTouch` 改「點按鈕選擇或拍攝跑步影片」；快取版號 `main.css?v=5.4.1`；W6 版號、新增 N5。JS、`lib/`、API、桌面與平板零變更。Spec: `context/features/5-4-1-mobile-empty-state-fix.md`（Opus 寫 spec／review，Sonnet 實作）。

驗證：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 353 通過，基準 103／361ms／96 不變；Playwright 觸控模擬（`isMobile`＋`hasTouch`，確認 `pointer: coarse`）412×737／390×700／375×667／360×740：空狀態無 HUD、無 label、提示與預覽鈕不重疊且在影片區內、卡片底部 ≤ 視窗，載入影片後 HUD 恢復，相位按鈕等高單行，無橫向溢出、console 0 error；1440／768（含觸控）不變；預覽播放、匯入 walk JSON 步頻 103、analyze／derive 200。未驗：實機 iOS／Samsung Internet、淺色主題、標題列上傳實點；360 寬相位標題列仍換行（留給 5.5）。

### 2026-11-15 — Fix 5.4.2: 手機版 Logo 固定與相位標題單行

實機回報：核心二相位標題（`#simPhaseTitle`）在「落下」等長文字時換兩行，`#simHud` 變高擠壓 `#simCanvas`，地板線忽上忽下；按「分析」會捲走 Logo、從分析切回核心時 Logo 仍不見且卡片下方多約 66px 空白。使用者決定「Logo 跟常駐區一起固定」。`main.css` 5.4 區段：`#appHeader` sticky（z 41、不透明底、1px 同色陰影蓋住 58.1／58px 小數縫隙）、`#simHud` nowrap、`#simPhaseTitle` 單行 ellipsis；`mobile-shell.js`：`fitCore` 設 `#mobileBar` top＝Logo 高、`leave` 清除、`fitAnchorMargin` 含 Logo；版號 `?v=5.4.2`；W6、新增 N6。其他 JS、`lib/`、API、桌面與平板零變更。Spec: `context/features/5-4-2-mobile-sticky-logo-sim-hud.md`（Opus spec／review，Sonnet 實作）。

驗證：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 354 通過，基準不變；Playwright 觸控模擬 412×737／390×700／375×667／360×740：四相位切換 `#simHud` 高 25.6、`#simCanvas` top 230.3 完全不變，標題單行；初始／分析／分析下捲 800px／切回核心一／二 Logo top 0、常駐區 top 58，切回核心卡片底部 ≤ 視窗；分析區頂端不被蓋住、高亮正確；1440／768 不變、390↔1440 縮放清除 inline 值；⚙ 面板、步幅面板、匯入 walk JSON 步頻 103、derive 200；console 0 error。未驗：真實影片擷取（用預覽資料）、`/api/analyze`、實機 iOS／Android。
