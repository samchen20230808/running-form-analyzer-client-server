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

### 2026-11-13 — Feature 5.3: 手機版三區殼層

手機（≤ 639.98px）重整為三區：Logo 2 行（說明僅非手機）、常駐 `#mobileBar`（sticky 3 行：身高／步幅／步頻／配速、目前分析影片＋上傳＋載入 JSON、核心一｜核心二｜分析切換）、主題區（核心一／二一次顯示一個，「分析」捲到分析區，匯出 JSON／報告在分析區頂端）。新增 `public/js/mobile-shell.js`：`matchMedia` 搬移既有節點（ID 不變，回桌面搬回原位）、分頁切換、步幅「改回 AI 自動」彈出面板；`main.css` 末端 5.3 區段（單一 P 查詢、id 選擇器）。既有 JS、`lib/`、API 零變更，桌面與平板不變，無新依賴。新增 M1–M5 測試，調整 W2／W6。Spec: `context/features/5-3-mobile-shell.md`。

驗證：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 348 通過，基準 103／361ms／96 不變；兩個故意改錯被抓到並還原；Playwright 390／360／768／1440 無橫向溢出、console 0 error，切換、分析捲動高亮、彈出面板、縮放搬移冪等、woman03 擷取 analyze／derive 200、匯入 walk JSON 步頻 103（報告同）。Opus review 後修：chip 誤判「手動鎖定機位」、分析高亮回跳、`scroll-margin-top`、chip 蓋住輸入框。未做／已知：規格 5.4 核心一工具列密度未實作；常駐區 163px（略高於 150）；手機看不到 km/h 與步頻評語徽章；數字輸入框視覺 28px（點整格聚焦）；無 jsdom 行為測試；實機（鍵盤彈出時 sticky、iOS／Android）待使用者驗。
