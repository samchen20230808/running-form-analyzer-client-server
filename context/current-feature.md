# Current Feature: 5.4 手機版核心一／二一屏顯示

## Status

In Progress

## Goals

- 手機（≤ 639.98px）切到核心一或核心二時，Logo＋常駐區＋主題卡整個放進一屏，不用捲動頁面；「分析」仍可下捲。
- 核心一、核心二的設定項（夜間增亮、方向、機位、1:1 即時驅動、圖層、骨架速度、圖例）收進「⚙」底部彈出面板，完成／遮罩／Esc／切換主題皆收起。
- 常駐區身高／步幅／步頻／配速不做單行摘要。
- 桌面與平板版面、既有 JS 邏輯、baseline 不變。

## Notes

- Spec：`context/features/5-4-mobile-one-screen.md`；分支：`feature-mobile-one-screen`。
- **Baseline（改前）**：`REQUIRE_BASELINE=1 npm test` 348 通過；量測 390×700：核心一 838px、核心二 843px，可用約 460px。
- **實作**：`#coreSection` 高度為 `calc(100svh − --chrome-h)`（`mobile-shell.js` 的 `fitCore()` 算 Logo＋常駐區＋16；`data-fit`，保底 `min-height: 420px`）；`#coreSection` 手機 `margin-top: 0`（扣掉 space-y 造成的 20px）；核心一標題列只留上傳／⚙；核心二標題列隱藏；HUD 疊在影片上、骨架 HUD 單行；四相位一排；按鈕文字以 `m-long` 縮短；設定項以節點搬移進 `#coreSettings`（ID 與事件不變，回桌面搬回）。測試新增 N1–N4，調整 W2／M1。
- **Opus review 後修**：⚙ 開啟時 `aria-expanded="true"`、關閉還焦點、面板 `aria-modal`；快取版號升 `?v=5.4`（W6 同步）；高度改 svh（避免網址列收合造成整頁跳動）；面板 `overscroll-behavior: contain`；上一／下一鈕 `aria-label`；規格驗證條件與實作對齊。已知：N4 為字串檢查、無 jsdom 行為測試；360×600 保底下控制列是否被裁、`:first-child` 選擇器脆弱、`#videoHud` 蓋影片頂端留實機觀察。
- **驗證**：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 352 通過；Playwright（dev）390×700／390×844／360×740：核心一、核心二卡片底部 ≤ 視窗高、無橫向溢出、卡片內可見控制項 ≥ 44px、console 0 error；360×600 為保底（略捲，預期）；⚙ 面板開關（完成／遮罩／Esc／切 tab）與面板內方向、機位、圖層操作正常；1440／768 節點在原位、無 `data-fit`、⚙ 隱藏；woman03 擷取 analyze／derive 200、匯入 walk JSON 步頻 103。

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
