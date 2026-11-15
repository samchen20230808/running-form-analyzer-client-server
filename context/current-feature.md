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
