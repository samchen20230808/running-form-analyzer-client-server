# Feature 3.8 — 報告匯出（瀏覽器列印另存 PDF）

## Status

`done`（第 8 節採建議預設；第 9 節未決事項暫採建議預設「沿用預設印出影片檔名、可改暱稱」，待使用者確認）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

把舊專案 Feature 3.1「匯出分析報告」（`D:\MyWeb\Running form analyzer\js\report.js`、`styles/main.css:63–109`、規格 `context/features/3-1-export-report.md`）搬入本專案，並依 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) 第 3 章 (4)、第 8 章「3.8」改為**只讀衍生結果**：舊版 `buildReportHtml` 的 `computeGctMetrics`（`report.js:56`）與 `computePersonalizedPhaseTiming`（`:58`）改讀 3.7 的 derive 快取與唯讀相位。

**Server 零變更、不新增端點、不引入核心、不新增依賴**（沿用舊版已決定的 `window.print()`＋print CSS，不用 jsPDF／html2canvas）。報告不發任何網路請求。

## 1. 目標與非目標

### 目標

1. 新增 `public/js/report.js`（classic script），提供 `openReport()`／`closeReport()`；啟用 `index.html:216–221` 目前 `disabled title="報告匯出於 3.4 提供"` 的「📄 匯出報告」按鈕（改為 `onclick="openReport()"`）。
2. 報告內容與舊版 3.1 相同（第 2 節），資料來源改為第 3 節所列。
3. 列印樣式沿用 `public/styles/main.css:63–109`（3.2 已原樣搬入，`#reportOverlay`、`.rp-*`、`@media print`），只做必要調整（第 4 節）。
4. 測試：Vitest 靜態檢查（第 6 節 R 組）＋ Playwright（含 `emulateMedia({ media: "print" })`）。

### 非目標

- Server 端產生 PDF、新增 `/api/report` 或任何端點；修改 `lib/`、`app/`、`derive.js` 的請求邏輯。
- 放入跑者影片截圖（舊版已決定只放骨架圖）、逐幀資料匯出、報告排版重新設計。
- 修改評分、診斷卡文案、UI 內嵌門檻（D10）；`APP_CONFIG.version` 升版（非發版）。

## 2. 報告內容（與舊 3.1 相同）

| 區塊 | 跑步 | 行走（`gct.skipHsuCompare`） |
| ---- | ---- | ---- |
| 標題：顯示名稱（預設影片檔名，可編輯）、分析日期、`APP_CONFIG.systemName`＋`version`、類型 | ✓ | ✓ |
| 基本資訊：步頻、步幅、換算配速／速度 | ✓ | ✓ |
| 骨架圖（個人骨架＋水滴軌跡＋徐骨架疊圖） | 四相位各一張 | 關鍵跑姿一張 |
| 綜合評分、7 大指標與教練診斷、GCT 色條與比對 | ✓ | ✗ |
| 備註（推算值、拍攝角度限制／行走說明） | ✓ | ✓ |

- 顯示名稱預設 `getReportVideoName(profile)`（去掉 `🎥 影片:`／`📄` 前綴）；可編輯，並同步 `document.title`（另存 PDF 的預設檔名），關閉時還原。
- 檔名只在本機 DOM 與 PDF 中出現，不上傳（與 `docs/privacy.md` 現有敘述一致，第 7 節 privacy 只需補一句）。

## 3. 資料來源（只讀 Client 已有狀態）

| 舊版（`report.js`） | 3.8 改為 |
| ---- | ---- |
| `:56` `computeGctMetrics(s, cadence)` | `getActiveDerived().metrics.gct`（`public/js/derive.js:34`） |
| `:58` `s.phaseTiming \|\| computePersonalizedPhaseTiming(s, cadence)` | `getActiveProfileTiming()`（`public/js/state.js:37`，唯讀）；無值時骨架圖只取 15% 一張 |
| `:57` `isWalk = !!gct.skipHsuCompare` | 同欄位，取自 derive 快取 |
| DOM 讀值：`#topCadenceInput`、`#bannerStrideInput`、`#topPaceVal`、`#topSpeedVal`、`#overallScoreNum`、`#overallGradeBadge`、`#overallScoreSummary`、`#diagnosticCardsContainer > div`、`#gctRangeBadge`、`#gctDetailText`、`#gctCompareBadge`、`#gctStatusText` | 不變（12 個 id 皆已存在於 `public/index.html`；這些 DOM 由 3.7 `updateTelemetryAndDiagnostics` 以 derive 結果渲染） |
| `captureSkeletonSnapshots`：暫改 `cyclePct`、`layers.ghost/trail`、`livePoseOverride` → `drawSimulator()` → `simCanvas.toDataURL` → 還原 | 原樣（全域皆在 `state.js`、`renderer.js:21`）；缺關鍵幀時 `renderer.js:187` 會畫提示，報告照實呈現 |

**匯出前置條件**（`openReport` 開頭）：`isDerivedCurrent(profile)`（`derive.js:40`）且 `deriveStatus !== "pending"`；否則 `alert("數值更新中或更新失敗，請稍候再匯出")` 並中止，不開浮層。理由：報告的 GCT 色條讀快取、其他數值讀 DOM，兩者必須是同一份輸入的結果（第 8 節第 1 點）。

**禁止**：`report.js` 不含 `fetch(`、不呼叫 `scheduleDerive`／`postDerive`、不寫 `profile.derived`、不寫 `summary.phaseTiming`、不含 M4 marker（GCT 文字如 `flightLabel` 只在執行期取自快取）。

## 4. 列印樣式（`@media print`）

沿用 `main.css:100–107` 的作法：

- `@page { size: A4 portrait; margin: 12mm; }`。
- 開啟報告時 `body.report-open`；列印時 `body.report-open > *:not(#reportOverlay)` 隱藏，`#reportOverlay` 改 `position: static`、白底；`.rp-toolbar` 隱藏。
- `.rp-page` 設 `print-color-adjust: exact`（骨架圖深色底、GCT 色條、卡片左框保留色彩）；`.rp-section`／`.rp-card`／`figure` 設 `break-inside: avoid`。
- 骨架圖以 data URL `<img>` 嵌入（離屏 canvas 先填 `#0b0f19` 再 `drawImage`），不依賴 canvas 在列印時重繪。
- 調整：`.rp-gct-bar`（`:108–109`）目前在 `@media print` 區塊之後，維持原位即可；只在 Playwright 發現問題時才改（例如 Tailwind CDN 的 preflight 覆寫 `img` 尺寸）。不新增字型（`Noto Sans TC` 未載入時退回系統字型，中文以系統字型呈現）。

## 5. 與 3.7 UI 的整合點

| 位置 | 修改 |
| ---- | ---- |
| `public/js/report.js` | 新增：自舊 `report.js` 搬移 `escapeReportHtml`、`getReportVideoName`、`captureSkeletonSnapshots`、`buildReportHtml`、`setReportDocTitle`、`openReport`、`openReportUnsafe`、`closeReport`；只改第 3 節的三處資料來源與前置條件；錯誤處理 `console.error`＋`alert` 改為 `console.warn`＋`alert`（console 0 error 驗收） |
| `public/index.html:216–221` | 按鈕移除 `disabled title=…`，加 `onclick="openReport()"` |
| `public/index.html:1331` | `<!-- report.js：3.4 搬入 -->` 改為 `<script src="js/report.js"></script>`（在 `analyzer.js`＋`bridge.js` 那一行之後；C2、U9 不受影響） |
| `public/styles/main.css:63–109` | 原則不改（第 4 節） |
| 互動中的狀態 | 報告開啟期間不暫停動畫；`captureSkeletonSnapshots` 的 `finally` 還原後呼叫 `drawSimulator()`，與舊版相同。關閉浮層後畫面狀態（圖層、Profile、播放、`cyclePct`）不變 |

## 6. 測試計畫

**既有測試**：全部照舊通過（含 M4 marker、U1 核心函式、U2 fetch 恰好兩處、「不使用瀏覽器儲存與其他外送通道」，這些規則自動涵蓋新檔）。`REQUIRE_BASELINE=1 npm test` 基準不變。

**R. 報告靜態檢查（`tests/legacy-client.test.js` 新增 describe）**

1. R1 `public/js/report.js` 存在；`index.html` 載入 `js/report.js` 恰好一次，位於含 `js/analyzer.js` 那一行之後；不再含 `報告匯出於 3.4 提供`、`report.js：3.4 搬入`；按鈕含 `onclick="openReport()"`。
2. R2 `report.js` 經 `getActiveDerived()` 取 GCT、經 `getActiveProfileTiming()` 取相位、以 `isDerivedCurrent` 把關；不含 `fetch`、`scheduleDerive`、`postDerive`、`.derived =`、`.phaseTiming =`。
3. R3 `report.js` 中 `buildReportHtml` 用到的 DOM id 皆存在於 `index.html`（字串比對清單）。
4. R4 `main.css` 含 `@media print`、`@page { size: A4 portrait`、`print-color-adjust: exact`、`body.report-open > *:not(#reportOverlay)`。
5. R5 `report.js` 不含 `console.error`。

**Playwright（`npm run dev`，`/index.html`）**

| # | 情境 | 期望 |
| - | ---- | ---- |
| P1 | 載入後等 derive 完成，按「匯出報告」 | 浮層出現；標題、步頻、步幅、配速、總分、7 張卡、GCT 文字與主畫面 DOM 字串全等；4 張骨架 `<img>` 為 `data:image/png`；**點擊後網路無新請求** |
| P2 | `page.emulateMedia({ media: "print" })` 後截圖與 `getComputedStyle` | 主畫面元素 `display: none`、`.rp-toolbar` 隱藏、`#reportOverlay` `position: static`、背景白；截圖存 scratchpad 目視確認中文與色條 |
| P3 | `page.pdf({ format: "A4" })`（Chromium）存 scratchpad | 產出成功、頁數合理（跑步約 2–3 頁）、區塊未被切斷（目視） |
| P4 | 匯入 walk 樣本（步頻 103）後匯出 | 類型「行走步態」、1 張骨架圖、無評分／卡片／GCT 區塊 |
| P5 | 匯入 `client-*.json`、無影片模擬擷取、選擇影片擷取後各匯出一次 | 顯示名稱預設為檔名；數值與畫面一致 |
| P6 | 修改顯示名稱 → `document.title` 變為「名稱 跑姿分析-YYYY-MM-DD」；關閉 → 還原 | 符合 |
| P7 | 以 `page.route` 延遲 `/api/derive`，手動步頻輸入後立即匯出；另讓 derive 回 429 | `alert`、浮層未開；狀態恢復後可匯出 |
| P8 | 匯出前關閉 ghost／trail 圖層、暫停於 40%；開啟並關閉報告 | 報告骨架含軌跡與徐骨架；關閉後圖層開關、`cyclePct`、播放狀態不變 |
| P9 | AGENTS 第 4 點：切換 Profile、播放骨架動畫、選擇／拖入影片、匯入／匯出 JSON | 正常；console 0 error、無 404 |

`window.print()` 本身不在自動化中觸發（會開系統對話框）；以 P2／P3 取代，另由使用者手動試一次「另存為 PDF」。

## 7. 驗收與文件

1. `npm run build`、`npm run lint`、`REQUIRE_BASELINE=1 npm test` 通過（R 組＋既有）；`git diff --stat -- lib app package.json` 為空。
2. P1–P9 通過，結果寫入 `context/current-feature.md` Notes。
3. 文件：`docs/planning/epics-and-features.md` 3.8 改 `done`；`docs/client-server-boundary.md` 第 8 章「3.8」補完成敘述；`docs/privacy.md` 補「報告在本機產生、含顯示名稱（預設影片檔名），不上傳」；`README.md` 功能清單補報告匯出。

## 8. 待決定（start 時先採預設）

1. **衍生值未就緒時**：拒絕匯出並 `alert`（**建議**）／照現有快取匯出並在報告備註標示「數值可能未更新」。
2. **骨架圖取樣**：沿用舊版四相位（`touchPct`／`posePct`／`fallPct`／`pullPct`）各一張、行走只取關鍵跑姿（**建議**）／一律一張。
3. **CSS 位置**：沿用 `main.css` 既有規則（**建議**）／拆成 `public/styles/report.css`。

## 9. 未決事項（需要使用者回答）

1. **報告是否沿用「預設印出影片檔名」？** 舊 3.1 使用者已確認「影片檔名印在報告」並提供可編輯的顯示名稱；本專案隱私文件強調檔名不上傳。報告為本機產生、不上傳，**建議預設：沿用**（預設檔名、可改暱稱）。替代：預設改為空白或 profile 名稱，由使用者自行輸入。
