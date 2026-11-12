# Feature 5.1 — 手機版 UI

## Status

`done`（第 16 節未決事項採預設；實機待驗見第 9 節）

## Epic

Epic 5 — PWA 與手機版 UI（最後階段）

## Objective

讓現有頁面（`public/index.html`）在手機尺寸可用：版面不溢出、觸控目標夠大、可選擇／拍攝影片、骨架畫布依容器縮放且清晰，並能用手指拖曳骨架動畫。

**已由使用者決定**：

1. 在舊頁面（`public/index.html`、`public/styles/`、`public/js/`）調整 RWD；**不引入框架、不新增依賴、不動 `lib/` 與 API**（不隨 React 化重做）。
2. 驗證用 Playwright 手機視窗（390×844、360×740、768×1024 等）；實機拍攝與操作列為使用者待驗清單（第 9 節）。

**決定（摘要）**：

- 斷點對齊 Tailwind：手機 `≤ 639.98px`、平板／窄視窗 `640–1023.98px`、桌面 `≥ 1024px`（第 6.1 節）。
- 所有新增樣式集中在 `main.css` 末端的一個 5.1 區段，**只用三個 `screen` 媒體查詢**、全部以 id 為範圍的選擇器；區段外（含 `@media print`）逐字不變，由測試以雜湊把關（第 7 節 W3）。
- 版面調整只靠 CSS＋在 `index.html` 加 `id` 掛鉤；**不改既有元素的 `class`**（多個按鈕的 `className` 會被 JS 整串覆寫，第 2.4 節）。
- `simCanvas`／`waveCanvas` 以「邏輯尺寸＋依顯示寬度與 `devicePixelRatio` 放大 backing store」繪製；DPR 1 桌面的 backing store 維持 700×480／720×150，畫面逐像素不變（第 6.5 節）。
- 骨架畫布加觸控水平拖曳換格（Pointer Events，只對 touch／pen），垂直滑動仍捲動頁面（第 6.6 節）。
- 觸控裝置另顯示「📹 拍攝影片」按鈕（`capture="environment"`）；既有三個影片 input 不加 `capture`（第 6.7 節）。

**行為不變**：`lib/**`、`app/**`、`next.config.mjs`、`vercel.json`、`package.json`、`APP_CONFIG` 不改；`npm test` 基準照舊（walk 103／361ms／96、三份 landmarks 193／176／150）；桌面（≥ 1024px、主要指標為滑鼠）版面、互動與列印逐項不變（第 6.9 節）。

## 1. 目標與非目標

### 目標

1. 390×844、360×740、768×1024（直向）與 844×390（橫向）視窗下：頁面無橫向溢出、無被裁切的文字或控制項、主要流程（選影片 → 擷取 → 看評分／診斷 → 播放與拖曳骨架 → 匯出 JSON／報告）都能用觸控完成。
2. 觸控／窄螢幕下所有可點控制項 ≥ 44×44 CSS px；`input`／`select` 字級 ≥ 16px（避免 iOS 聚焦自動放大）。
3. 骨架畫布與波形圖依容器縮放、保持比例，高 DPR 螢幕下清晰；畫布上的圖例與 HUD 在手機上不遮住骨架。
4. 觸控裝置：影片可從相簿／檔案選擇，或直接拍攝；拖放提示改為觸控適用的文案。
5. 報告浮層在手機畫面可閱讀與操作；**列印／另存 PDF 輸出與 3.8 完全相同**。
6. 桌面版零回歸（第 6.9 節定義），由 Playwright 與基準比對驗證。
7. Vitest 靜態檢查（第 7 節 W 組）＋Playwright 手機視窗驗證（第 8 節）；文件同步（第 11 節）。

### 非目標

- React 化、改用元件框架、移除或釘版 Tailwind CDN（另開 Feature）。
- PWA（5.2）：manifest、service worker、安裝提示、`viewport-fit=cover` 與安全區域內距。
- MediaPipe 在手機上的效能調校（改 Lite 模型、降低解析度、Web Worker）；只記錄實機耗時（第 9 節）。
- `videoOverlayCanvas` 的 DPR 處理（backing store 已是影片原始解析度；模擬訊號 640×400 維持）。
- 桌面 Firefox 的 range 樣式（現況未設 `::-moz-range-*`，桌面不動）。
- 畫布雙指縮放、平移；手機專用的鍵盤快捷鍵；橫向專屬版面（橫向只要求不溢出、可操作）。
- 評分、診斷文案、UI 內嵌門檻（D10）；`APP_CONFIG.version` 升版。
- 修改 `lib/`、API、`app/`、`next.config.mjs`、依賴。

## 2. 現況盤點

基準：`main` `bc7d78f`，工作區乾淨。以下為讀碼結果；標「量測」者 start 時以 Playwright 在 360×740 實測確認並寫入 Notes。

### 2.1 頁面基礎

| 項目 | 位置 | 現況 | 5.1 |
| ---- | ---- | ---- | --- |
| viewport meta | `index.html:5` | `width=device-width, initial-scale=1.0`；無 `maximum-scale`／`user-scalable=no` | **不改**（不禁止縮放；W1 把關） |
| 樣式 | `index.html:12`、`:62` | Tailwind Play CDN（v3，執行期注入 `<style>`）＋`styles/main.css?v=3.1` | `main.css` 末端加 5.1 區段；查詢參數改 `?v=5.1` |
| `body` | `main.css:1–6` | `overflow-x: hidden` | 保留。注意它會**遮蔽**溢出（被裁切而非出現捲軸），iOS Safari 仍可能橫向平移，所以溢出要真正修掉，驗證不能只看 `scrollWidth`（第 8 節 P1） |
| 疑似無效的 Tailwind 類別 | `:116` `w-13`、`:290` `w-18`、多處 `py-0.2`、`backdrop-blur-xs` | v3 預設沒有這些刻度（v4 才有），可能退回瀏覽器預設寬度 | 量測；**不改 class**（桌面現狀即基準），手機以 id 選擇器覆寫寬度 |

### 2.2 窄螢幕會溢出、被遮擋或過小的元素

| 區塊 | 位置 | 問題（360 寬，內容寬約 328px） |
| ---- | ---- | ---- |
| Header | `:68–70` | `sticky top-0`；工具列 7 組控制項換行後 header 高約 200px 以上（量測），黏在頂端吃掉約 1/4 畫面 |
| Header 副標 | `:97–99` | 一行約 60 字，換成 3–4 行 |
| Header 身高／步幅輸入 | `:105–143` | 字級 12px（iOS 聚焦放大）；高度約 24px；步幅群組與 banner 的 `#bannerStrideInput` 重複 |
| 上傳／載入 JSON 標籤、匯出按鈕 | `:145–208` | 高約 28px（`py-1.5`＋12px） |
| 模型選單 | `:175–178` | `min-w-[240px]`、字級 12px；包在 `p-1` 容器內，量測是否超出 |
| 核心一工具列 | `:347–400` | 方向切換 `py-0.5`（約 20px）、機位選單無背景字級 11px、夜間增亮按鈕約 24px |
| 影片 HUD | `:484–526` | 第二列 4 個數值 `flex` 不換行，寬約 380px，被 `#videoDropZone` 的 `overflow-hidden` 裁切 |
| 1:1 即時驅動 | `:528–538` | 絕對定位右下角，壓在影片上；高約 28px |
| 拖放提示 | `:456–462`、`:423–433` | 「拖拉 (Drag & Drop)」「放開滑鼠」在手機不適用 |
| 空狀態浮層 | `:435–482` | 容器 `min-h-[360px]`；手機上 canvas 預設 640×400 → 顯示約 328×205，浮層內容（圖示＋標題＋說明＋兩顆按鈕）需高約 260px（量測是否被裁） |
| 影片控制列 | `:544–583` | 「上一 Frame／下一 Frame」約 28px；進度條 `min-w-[90px]`，thumb 18px、track 6px（`main.css:21–40`），手指難拖 |
| 核心二圖層按鈕 | `:627–640` | 高約 26px |
| 骨架畫布疊層 | `:655–727` | 左上圖例 `max-w-[calc(55%-0.625rem)]`、6 列 10px 文字；右上 HUD；手機上畫布顯示約 328×225，兩個疊層蓋住大半骨架 |
| 骨架控制列 | `:733–789` | 上一格／下一格約 28px、速度切換 `py-0.5` 約 20px、`#cycleSlider` 同上 |
| 四相位按鈕 | `:792–880` | `grid-cols-4`，每顆約 78px 寬，副標 `truncate` 幾乎全被截斷 |
| KPI 面板 | `:937`、`:980–1001` | `grid-cols-2`，每格約 160px；第 2 格同列放「185ms (徐<200)」與「初瞬膝 155°」，`justify-between` 不換行（量測） |
| 相位／GCT 面板 | `:1194–1243` | 多列 `flex justify-between` 不換行，長字串擠壓（量測） |
| 波形圖 | `:1245–1254` | `waveCanvas` 720×150，`w-full h-full`、**無 `object-contain`**：手機上若容器高度被撐開會非等比拉伸（量測顯示比例是否 ≈ 4.8） |
| 診斷區燈號圖例 | `:1271–1285` | `flex` 不換行，四個項目約 330px（量測） |
| 診斷卡「🎯 定格檢視」 | `index.html:1975`（JS 產生） | `py-1`，高約 22px |
| 報告浮層 | `main.css:64–99` | `.rp-toolbar input { width: 280px }`、字級 12px；`.rp-page` 內距 32/36px；`.rp-basic` 三欄、`.rp-cards`／`.rp-shots` 兩欄，在 360 寬只剩約 290px 內容寬 |

### 2.3 畫布

| 畫布 | 位置 | 現況 |
| ---- | ---- | ---- |
| `simCanvas` | `index.html:647–652`、`renderer.js:21–26` | 屬性 700×480；CSS `w-full h-full object-contain`；`drawSimulator` 以 `simCanvas.width/height` 為 `W/H`，地面 `groundY = 462`、原點 `W * 0.48` 皆為 700×480 座標 |
| `waveCanvas` | `index.html:1248–1253`、`renderer.js:577–587` | 屬性 720×150；`drawWaveform` 以 `waveCanvas.width/height` 為 `W/H` |
| 報告截圖 | `report.js:32–38` | 離屏 canvas 尺寸取 `simCanvas.width/height`，`drawImage(simCanvas, 0, 0)` |
| `videoOverlayCanvas` | `ui.js:143–146`、`index.html:1995–1996`、`pose.js:52`、`analyzer.js:16,182` | 尺寸 = 影片解析度或 640×400；擷取上傳 `frameWidth/Height` 讀它。**5.1 不動** |

全專案沒有 `devicePixelRatio`、`ResizeObserver`；backing store 固定，手機（DPR 3、顯示寬約 328px）需要約 984 裝置像素，現為 700 → 放大約 1.4 倍而變糊；Retina 桌面同理。

### 2.4 互動與事件

- **拖曳骨架**：畫布上沒有任何 pointer／touch／mouse 事件；唯一的換格方式是 `#cycleSlider`（`manualScrubCycle`，`ui.js:273`）、上一格／下一格與四相位按鈕。
- **拖放影片**：`ui.js:56–92` 綁 `dragenter/over/leave/drop`；手機瀏覽器沒有檔案拖放，無害但文案誤導。
- **影片 input**：三個 `type="file" accept="video/*"`（`index.html:149–155` `#navVideoUploadInput`、`:392–398` `#videoUploadInput`、`:468–473` 無 id），都是 `class="hidden"` 包在 `<label>` 內；無 `capture`。`#jsonImportInput` 為 `accept=".json"`（`:162–168`）。
- **影片解碼失敗**：`loadVideoFile`（`ui.js:105–167`）只設 `onloadeddata`，沒有 `onerror`；瀏覽器無法解碼（例如 Android Chrome 讀 iPhone 的 HEVC `.mov`）時畫面停在空白、無提示。
- **hover**：`hover:` 類別只是顏色回饋，沒有只能靠 hover 的功能；`#runnerPhaseBar`／`#contactFlightBar` 色段的 `title` 提示是 hover-only，但相同資訊已在 `#runnerPhaseDistBadges`、`#gctDetailText` 以文字呈現，**不處理**。
- **`className` 整串覆寫**（新樣式不可依賴這些元素的 class）：`ui.js:17–22`（`#videoPlayBtn`）、`:39–44`（`#nightBoostBtn`）、`:172–179`（方向按鈕）、`:234–243`（`#simPlayBtn`）、`:263–271`（速度按鈕）、`analyzer.js:153`、`:229–234`（`#captureCycleBtn`）、`index.html:1388–1395`（`#strideSourceBadge`）、`:1962–1981`（診斷卡 `innerHTML`）。
- **Tailwind 優先序**：Play CDN 的 `<style>` 於執行期插入 `<head>`，位置在 `main.css` 之後；同為單一 class 的規則會輸給 utility。5.1 規則一律以 id 為範圍（特異度 ≥ 1,0,0），不使用 `!important`。
- **腳本順序**：`ui.js` 在 `renderer.js` 之前載入（`index.html:1313–1314`），`ui.js` 頂層不可引用 `renderer.js` 宣告的 `simCanvas`（TDZ），改用 `document.getElementById`。

### 2.5 列印

`main.css:100–107` 的 `@media print`（3.8，`tests/legacy-client.test.js` R4）與 `:108–109` `.rp-gct-bar`。5.1 不改；新規則全部限定 `screen`，列印時不生效（第 6.8 節）。

## 3. 查證

依 AGENTS，start 時重讀；本 Feature 不使用 Next API，只確認 `node_modules/next/dist/docs/` 中 `public` 資料夾靜態檔的服務方式與快取標頭無變更（`main.css?v=` 參數只是保險）。

瀏覽器行為（**start 時以 MDN／WebKit／Chrome 官方文件查證**，結果寫入 Notes，不符時以官方為準並更新本規格）：

- `<input type="file" accept="video/*">` 不帶 `capture`：iOS Safari 顯示「照片圖庫／拍攝影片／選擇檔案」；Android Chrome 顯示含攝影機的選擇器。帶 `capture="environment"`：直接開後鏡頭、**不能選既有檔案**；iOS 以此拍攝的影片不會自動存入相簿（Android 依相機 App）。
- iOS Safari：聚焦字級 < 16px 的 `input`／`select` 會自動放大頁面。
- `@media (pointer: coarse)`、`(hover: none)`：手機與平板為 coarse／none；觸控筆電主要指標通常為 fine。
- Pointer Events＋`touch-action: pan-y`：垂直手勢交給瀏覽器捲動（觸發 `pointercancel`），水平手勢交給頁面；`setPointerCapture` 讓拖出畫布仍持續收到事件。
- `ResizeObserver`、`devicePixelRatio`：Safari 13.1+／Chrome 64+ 支援。
- Playwright／CDP：`Emulation.setDeviceMetricsOverride({ mobile: true, deviceScaleFactor })`＋`Emulation.setTouchEmulationEnabled` 是否使 `pointer: coarse`／`hover: none` 生效；不行則以 `browser.newContext({ viewport, deviceScaleFactor, isMobile: true, hasTouch: true })` 開新 context（第 8 節）。

## 4. 作法比較

### 4.1 樣式放哪裡：**`main.css` 末端單一區段＋id 選擇器**

| 選項 | 評估 |
| ---- | ---- |
| **A. `main.css` 末端 5.1 區段，只用三個 `screen` 媒體查詢、id 選擇器（建議）** | 桌面與列印由「區段外逐字不變」＋「區段內無無條件規則」兩條測試把關；不受 JS 覆寫 `className` 影響；特異度穩贏 Tailwind |
| B. 在 HTML 加 Tailwind 響應式類別（`max-lg:`、`sm:` 等） | 會被 JS 覆寫的按鈕失效；改到既有 `class` 難以證明桌面零回歸；依賴 CDN 執行期產生 |
| C. 新檔 `public/styles/mobile.css` | 多一個請求與載入順序要管；與 A 同效果。若區段超過約 200 行再考慮 |

### 4.2 畫布清晰度：**邏輯尺寸＋依需要放大 backing store**

| 選項 | 評估 |
| ---- | ---- |
| **A. 邏輯尺寸常數、`setTransform` 縮放，scale 依「顯示寬 × DPR ÷ 邏輯寬」取 0.25 的倍數、上限 3，需求 ≤ 1.25 時維持 1（建議）** | DPR 1 桌面 backing store 不變、畫面逐像素相同；手機與 Retina 清晰；繪圖座標全不改 |
| B. 只靠 CSS 縮放（現況） | 零風險，但手機與 Retina 偏糊，不符目標 3 |
| C. scale 一律 = `devicePixelRatio` | 桌面大畫面時 backing store 可能比需要小，或手機上過大（700×3 = 2100 寬）浪費；與 A 相比沒有好處 |

### 4.3 拖曳骨架：**Pointer Events，只對 touch／pen**

| 選項 | 評估 |
| ---- | ---- |
| **A. `simCanvas` 上水平拖曳換格，`pointerType === "mouse"` 時不處理（建議）** | 手機最直覺；桌面滑鼠行為完全不變（零回歸）；一套事件涵蓋 touch 與 pen |
| B. 同 A，但滑鼠也可拖 | 桌面多一個功能，屬行為變更，不在本 Feature 要求 |
| C. 不做，只放大 `#cycleSlider` | 最少改動；但 slider 在手機上與「上一格／下一格」擠在同列，精細操作差 |
| D. `touchstart/touchmove`＋`mousedown` 兩套 | 重複程式、要自己處理 passive 與捲動衝突；不採用 |

### 4.4 拍攝影片：**觸控裝置另顯示一顆 `capture` 按鈕**

| 選項 | 評估 |
| ---- | ---- |
| **A. 既有 input 不變；觸控裝置在空狀態浮層與核心一工具列各多一顆「📹 拍攝影片」（`capture="environment"`）（建議）** | 一鍵開後鏡頭；不影響「從相簿選」；桌面看不到（`hover: none and pointer: coarse` 才顯示） |
| B. 不加，靠系統選單的「拍攝影片」 | 零改動；系統選單本來就含拍攝。缺點：使用者不一定知道 |
| C. 既有 input 加 `capture` | 會讓手機**無法選既有影片**（側拍多半是他人拍好再傳），不可行 |

## 5. 範圍

```
public/index.html          # 修改：加 id 掛鉤、觸控用提示與拍攝按鈕、main.css?v=5.1；不改既有 class、viewport 不改
public/styles/main.css     # 修改：末端新增 5.1 區段（第 6.2–6.8 節）；區段外逐字不變
public/js/renderer.js      # 修改：邏輯尺寸常數、fitCanvasResolution、ResizeObserver、draw 函式改讀邏輯尺寸
public/js/ui.js            # 修改：simCanvas 觸控拖曳換格；loadVideoFile 加 onerror 提示
public/js/report.js        # 修改：骨架截圖固定邏輯尺寸 700×480
tests/legacy-client.test.js  # 新增 describe「W 5.1 手機版 UI」（第 7 節）
README.md、docs/planning/epics-and-features.md、docs/privacy.md、docs/deployment.md
context/current-feature.md   # Notes
```

- **不修改**：`lib/**`、`app/**`、`public/modules/**`（不需 `sync:legacy`）、`public/js/{config,state,pose,derive,analyzer}.js`、`next.config.mjs`、`vercel.json`、`package.json`、`scripts/**`、`AGENTS.md`、`APP_CONFIG`。
- **不新增依賴。**

## 6. 設計決策

### 6.1 斷點與媒體查詢

5.1 區段只允許以下三個查詢（逐字，W3 把關）：

| 代號 | 查詢 | 用途 |
| ---- | ---- | ---- |
| T | `@media screen and (max-width: 1023.98px), screen and (pointer: coarse)` | 觸控目標、輸入字級、header 不黏頂、`touch-action`、slider 加大 |
| P | `@media screen and (max-width: 639.98px)` | 手機版面堆疊（疊層移出畫布、相位按鈕兩欄、header 精簡、報告浮層畫面樣式） |
| H | `@media screen and (hover: none) and (pointer: coarse)` | 觸控專用元素顯示／拖放文案切換 |

- `.98` 避免與 Tailwind `sm:`（640）、`lg:`（1024）的 `min-width` 重疊。
- 全部帶 `screen`：列印不受影響（第 6.8 節）。
- 平板（640–1023）沿用現有 Tailwind 斷點的單欄堆疊，只套 T；iPad 橫向（≥ 1024、coarse）維持桌面版面並套 T（第 16 節第 2 點）。

### 6.2 HTML 掛鉤（只加 `id`，不改既有 `class`）

| 新 id | 元素（位置） |
| ----- | ---- |
| `appHeader` | `<header>`（`:68`） |
| `headerToolbar` | 工具列容器（`:104`） |
| `headerStrideGroup` | header 步幅群組（`:121`） |
| `profileSelectGroup` | 模型選單外框（`:171`） |
| `dashBanner` | 儀表 banner（`:218`） |
| `videoHud` | 影片左上 HUD（`:484`） |
| `liveSyncLabel` | 1:1 即時驅動標籤（`:528`） |
| `dropHintDesktop` | 既有拖放標題 `<h3>`（`:456`） |
| `coreTwoCard` | 核心二卡片（`:605`） |
| `simStage` | 骨架畫布容器（`:644`） |
| `simLegend`、`simHud` | 畫布左上圖例（`:655`）、右上 HUD（`:706`） |
| `phaseBtnGrid` | 四相位按鈕格（`:792`） |
| `kpiGrid` | KPI 面板（`:937`） |
| `phaseTimingPanel` | 相位／GCT 面板（`:1194`） |
| `waveStage` | 波形圖容器（`:1245`） |
| `diagLegend` | 燈號圖例列（`:1271`） |

新增元素（皆帶 Tailwind `hidden`，只在 H 查詢以 id 規則顯示）：

- `<p id="dropHintTouch" class="hidden …">點下方按鈕選擇或拍攝跑步影片</p>`：放在 `#dropHintDesktop` 旁。
- 「📹 拍攝影片」：`<label id="videoCaptureLabel" class="hidden …"><span>📹 拍攝影片</span><input type="file" id="videoCaptureInput" accept="video/*" capture="environment" class="hidden" onchange="handleVideoUpload(event)" /></label>`，放在空狀態浮層按鈕群（`:463`）；核心一工具列（`:388` 旁）另放 `#videoCaptureLabelBar`／`#videoCaptureInputBar`（同屬性）。浮層 `pointer-events-none`，按鈕須加 `pointer-events-auto`（比照 `:465`）。

`<link rel="stylesheet" href="styles/main.css?v=5.1" />`。viewport meta 不動。

### 6.3 版面（P：≤ 639.98px）

- **Header**：`#navSubtitle` 隱藏；`#headerStrideGroup` 隱藏（`#bannerStrideInput` 與「重設自動」在 banner，JS 本來就同步兩個輸入，`report.js` 讀 banner 那個）；`#headerToolbar` 改 `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))`，`#profileSelectGroup` 跨兩欄、`#profileSelect { min-width: 0; width: 100% }`；標籤與按鈕內容置中。
- **影片區**：`#videoDropZone` 改 `flex-direction: column; min-height: 280px`；`#videoHud` 改 `position: static; order: -1; width: 100%`，其第二列 `flex-wrap: wrap`；`#videoOverlayCanvas { width: 100%; height: auto; max-height: 70vh; object-fit: contain }`（直式影片不會撐滿整頁）；`#liveSyncLabel` 改 `position: static; order: 1; align-self: flex-end; margin: 8px`。`#dragHoverBanner`、`#videoEmptyOverlay` 維持絕對定位覆蓋。
- **影片／骨架控制列**：`#videoSeekSlider`、`#cycleSlider` 改 `flex-basis: 100%`（獨佔一列）。
- **骨架區**：`#simStage` 改 `flex-direction: column; min-height: 0`；`#simCanvas { width: 100%; height: auto }`（屬性尺寸提供比例，backing store 等比放大不改比例）；`#simHud` 改 `position: static; order: -1; max-width: none; width: 100%; text-align: left`；`#simLegend` 改 `position: static; order: 1; max-width: none; margin: 8px`。
- **四相位**：`#phaseBtnGrid { grid-template-columns: repeat(2, minmax(0, 1fr)) }`。
- **KPI／相位面板／圖例**：`#kpiGrid .justify-between`、`#phaseTimingPanel .justify-between` 加 `flex-wrap: wrap; gap: 4px`；`#diagLegend { flex-wrap: wrap }`。
- **波形圖**：`#waveStage { min-height: 0 }`、`#waveCanvas { height: auto; aspect-ratio: 720 / 150 }`（等比）。

### 6.4 觸控目標與輸入（T）

- 下列選擇器 `min-height: 44px; min-width: 44px; touch-action: manipulation`：`#appHeader button`、`#appHeader label`、`#appHeader select`、`#dashBanner button`、`#coreOneCard button`、`#coreOneCard select`、`#coreOneCard label`、`#coreTwoCard button`、`#diagnosticCardsContainer button`（JS 產生，id 範圍選擇器仍適用）。分段按鈕（方向、速度）各自 ≥ 44，外框跟著變高。
- `#appHeader input[type="number"]`、`#appHeader select`、`#cameraModeSelect`、`#videoRateSelect`：`font-size: 16px; min-height: 44px`（`#topCadenceInput`、`#bannerStrideInput` 已是 20px，只補 `min-height`）；`#runnerHeightInput`、`#customStrideInput` 設 `width: 4.5em`（取代疑似無效的 `w-13`）。
- `#cycleSlider`、`#videoSeekSlider`：`height: 44px`；`::-webkit-slider-runnable-track` 高 8px；`::-webkit-slider-thumb` 28×28、`margin-top: -10px`；另設 `::-moz-range-track`／`::-moz-range-thumb` 同尺寸（只在 T 內，桌面 Firefox 不變）。
- `#appHeader { position: static }`（不黏頂；桌面維持 `sticky`）。
- `#simCanvas { touch-action: pan-y }`（第 6.6 節）。

### 6.5 畫布縮放與清晰度（`renderer.js`）

```js
const SIM_SIZE = { w: 700, h: 480 };
const WAVE_SIZE = { w: 720, h: 150 };
let simScale = 1;
let waveScale = 1;

// 依實際顯示寬度與 devicePixelRatio 決定 backing store 倍率；需求 ≤ 1.25 時維持 1（DPR 1 桌面不變）
function fitCanvasResolution(canvas, size) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const shownW = Math.min(r.width, (r.height * size.w) / size.h); // object-contain 的實際內容寬
  const need = (shownW * (window.devicePixelRatio || 1)) / size.w;
  const scale = need <= 1.25 ? 1 : Math.min(3, Math.ceil(need * 4) / 4);
  const w = Math.round(size.w * scale);
  const h = Math.round(size.h * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return scale;
}
```

- `drawSimulator` 開頭改為 `const W = SIM_SIZE.w; const H = SIM_SIZE.h; simCtx.setTransform(simScale, 0, 0, simScale, 0, 0);`，其餘繪圖碼不變（座標仍為 700×480）。`drawWaveform` 同理（`WAVE_SIZE`、`waveScale`）。scale = 1 時 `setTransform(1,0,0,1,0,0)` 為恆等，輸出與現況逐像素相同。
- `ResizeObserver` 觀察 `simCanvas`、`waveCanvas`（以及 `matchMedia("(resolution: …dppx)")` 變化不另處理，視窗移到不同 DPR 螢幕時下一次 resize 會修正）：回呼中重算 scale，**有變動才**重設尺寸並立即 `drawSimulator()`／`drawWaveform()`（重設尺寸會清空畫布，暫停狀態也要重畫）。
- 不會造成 resize 迴圈：桌面 CSS 框由 `w-full h-full` 決定、與 backing store 無關；手機 `height: auto` 時 scale 為 0.25 的倍數，700／480／720／150 乘上後皆為整數，比例不變、框高不變。
- 報告（`report.js:32–38`）：離屏 canvas 固定 `SIM_SIZE`，`ctx.drawImage(simCanvas, 0, 0, SIM_SIZE.w, SIM_SIZE.h)`，報告圖片在任何裝置都是 700×480，PDF 與 3.8 相同。
- `index.html` 的 `width`／`height` 屬性不改（JS 執行前的預設與比例來源）。

### 6.6 觸控拖曳骨架（`ui.js`）

```js
// 5.1：觸控／筆在骨架畫布上水平拖曳換格；滑鼠不處理（桌面行為不變）
const simScrubCanvas = document.getElementById("simCanvas");
let simScrub = null; // { id, x, y, pct, active }
simScrubCanvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  simScrub = { id: e.pointerId, x: e.clientX, y: e.clientY, pct: cyclePct, active: false };
});
simScrubCanvas.addEventListener("pointermove", (e) => {
  if (!simScrub || e.pointerId !== simScrub.id) return;
  const dx = e.clientX - simScrub.x;
  const dy = e.clientY - simScrub.y;
  if (!simScrub.active) {
    if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
    simScrub.active = true;
    simScrubCanvas.setPointerCapture(e.pointerId);
  }
  const width = simScrubCanvas.getBoundingClientRect().width || 1;
  const pct = simScrub.pct + (dx / width) * 100; // 拖過整個畫布寬 = 一個週期
  jumpToCyclePct(Math.round(((pct % 100) + 100) % 100));
});
for (const type of ["pointerup", "pointercancel"]) {
  simScrubCanvas.addEventListener(type, () => { simScrub = null; });
}
```

- 重用 `jumpToCyclePct`（`ui.js:292`）：暫停循環、清除即時驅動、同步 `#cycleSlider`、更新 HUD 與重畫，與拖 slider 的副作用一致。
- 點一下（位移 < 8px）不做任何事，避免誤觸暫停。垂直手勢由 `touch-action: pan-y` 交給瀏覽器捲動（會收到 `pointercancel`）。
- 不使用 `touchstart`／`touchmove`／`mousedown`（W9 把關）。
- `simCanvas` 不是 `pointer-events-none`（`videoOverlayCanvas` 才是），疊層 `#simLegend`／`#simHud` 為 `pointer-events-none`，桌面上不擋事件。

### 6.7 影片選擇與拍攝

- 既有三個影片 input 維持 `accept="video/*"`、**不加 `capture`**。
- 觸控裝置（H）顯示 `#videoCaptureLabel`、`#videoCaptureLabelBar`（`display: inline-flex`）；文案旁加小字「拍攝的影片可能不會自動存入相簿」。
- 拖放：H 下隱藏 `#dropHintDesktop`、顯示 `#dropHintTouch`；拖放程式不動（手機不會觸發）。
- `#jsonImportInput` 改 `accept=".json,application/json"`（部分 Android 檔案選擇器以 MIME 過濾，只寫副檔名會讓 JSON 變灰；第 15 節第 7 點）。
- `loadVideoFile` 加 `sourceVideo.onerror`：`alert("此瀏覽器無法播放這支影片（常見為 iPhone 的 HEVC 格式），請改用 H.264 MP4，或在 iPhone「設定 › 相機 › 格式」選「最相容」後重拍")`，並還原空狀態浮層（`#videoEmptyOverlay` 移除 `hidden`）。正常影片不觸發，桌面行為不變。
- 隱私：拍攝的影片與選擇的檔案相同，只在本機以 `URL.createObjectURL` 播放，不上傳（`docs/privacy.md` 補一句，第 11 節）。

### 6.8 報告浮層與列印

- P 查詢內（`screen`）：`#reportOverlay { padding: 8px }`；`.rp-toolbar input { width: 100%; font-size: 16px; min-height: 44px }`、`.rp-toolbar button { min-height: 44px }`；`.rp-page { padding: 16px }`；`.rp-basic { flex-wrap: wrap }`、`.rp-basic > div { flex-basis: calc(50% - 6px) }`；`.rp-cards`、`.rp-shots { grid-template-columns: 1fr }`；`.rp-shots-one { max-width: 100% }`。
- `@media print` 區塊（`main.css:100–107`）與 `.rp-*` 原規則不動；列印時 `screen` 查詢不成立，手機上「列印／存 PDF」的輸出與桌面相同。報告截圖固定 700×480（第 6.5 節）。
- 報告是 `.rp-*` class 而非 id，因為 Tailwind 不作用在報告 HTML 的這些 class 上；W5 允許 `.rp-` 與 `#reportOverlay` 開頭的選擇器（只在 P 內）。

### 6.9 桌面零回歸的定義

「桌面」= 視窗寬 ≥ 1024px 且主要指標為滑鼠／觸控板（`pointer: fine`）。

1. 5.1 區段的規則一條都不生效（三個查詢皆不成立）；`main.css` 區段外逐字不變（W3 雜湊）。
2. `index.html` 的 diff 只有：新增 `id` 屬性、帶 `hidden` 的新元素、`main.css?v=5.1`、`#jsonImportInput` 的 `accept`。既有 `class` 字串零變更（驗收第 4 點以 diff 檢查）。
3. DPR 1：`simCanvas`／`waveCanvas` backing store 仍為 700×480／720×150，`toDataURL()` 與 `main` 相同（P12）。DPR > 1 的桌面（Retina）只會更清晰，邏輯內容相同。
4. 滑鼠在畫布上的行為不變（拖曳不換格）；鍵盤快捷鍵、拖放影片不變。
5. 列印與 PDF 與 3.8 相同（P11）。

視窗縮到 1024 以下的桌面瀏覽器會套用 T（header 不黏頂、目標變大），屬預期。

## 7. 測試計畫

**既有測試**：全部照舊（含 R4 列印樣式、U2 fetch 恰好兩處、「不使用瀏覽器儲存與其他外送通道」，自動涵蓋修改後的檔案）。`REQUIRE_BASELINE=1 npm test` 基準不變。本 Feature 不碰 `lib/`，基準通過是預期而非新證據。

**W. 5.1 手機版 UI（`tests/legacy-client.test.js` 新增 describe）**

`main.css` 的 5.1 區段以 `/* 5.1 手機版 RWD：開始 */` 與 `/* 5.1 手機版 RWD：結束 */` 標記，位於檔案末端；讀檔後先把 `\r\n` 正規化為 `\n`。

1. **W1 viewport**：`index.html` 恰有一個 `name="viewport"`，含 `width=device-width` 與 `initial-scale=1`；不含 `user-scalable=no`、`maximum-scale`。
2. **W2 區段存在**：兩個標記各恰好一次、順序正確，結束標記後只剩空白；區段內含 `min-height: 44px`、`font-size: 16px`、`touch-action: pan-y`、`touch-action: manipulation`。
3. **W3 桌面與列印不受影響**：區段**之外**的內容 SHA-256（`node:crypto`）等於 start 時對 `main` 版 `main.css` 正規化後算出的常數；區段內每一條規則都位於 `@media` 內，且 `@media` 條件只有第 6.1 節 T／P／H 三個字串（逐字）；區段內不含 `print`、`!important`。
4. **W4 列印**：`@media print` 恰好一個（區段外）；區段內出現的 `.rp-`／`#reportOverlay` 選擇器全在 P 查詢內。
5. **W5 選擇器範圍**：區段內每個選擇器以 `#` 開頭，或在 P 內以 `.rp-` 開頭；區段內引用的每個 `#id` 都在 `index.html` 以 `id="…"` 出現恰好一次。
6. **W6 HTML 掛鉤**：第 6.2 節的 id 全部存在且唯一；`#dropHintTouch`、`#videoCaptureLabel`、`#videoCaptureLabelBar` 的 class 含 `hidden`；`main.css?v=5.1`；`<canvas id="simCanvas"` 仍為 `width="700" height="480"`、`waveCanvas` 仍為 `width="720" height="150"`。
7. **W7 檔案輸入**：所有 `type="file"` 中，`accept="video/*"` 者恰 5 個；帶 `capture` 的恰 2 個，皆為 `capture="environment"`、id 為 `videoCaptureInput`／`videoCaptureInputBar`、`onchange="handleVideoUpload(event)"`；`#jsonImportInput` 的 `accept` 含 `.json` 與 `application/json`。
8. **W8 畫布解析度**：`renderer.js` 含 `devicePixelRatio`、`ResizeObserver`、`setTransform`、`SIM_SIZE`、`WAVE_SIZE`；不匹配 `/const W = (simCanvas|waveCanvas)\.width/`；`report.js` 不含 `off.width = simCanvas.width`，含 `SIM_SIZE`。
9. **W9 觸控拖曳**：`ui.js` 含 `pointerdown`、`pointercancel`、`setPointerCapture`、`pointerType === "mouse"`、`jumpToCyclePct(`；`public/js/**` 不含 `touchstart`、`touchmove`、`"mousedown"`；`ui.js` 頂層不引用 `simCanvas` 識別字（以 `getElementById("simCanvas")` 取得）。
10. **W10 解碼失敗提示**：`ui.js` 的 `loadVideoFile` 區段含 `sourceVideo.onerror`。

**驗證測試會抓到錯誤**（start 時做一次、記錄後還原）：在區段外改一個字元（W3 失敗）；在區段內加一條不在 `@media` 內的規則（W3 失敗）；把 `capture` 加到 `#navVideoUploadInput`（W7 失敗）；把 viewport 改為含 `user-scalable=no`（W1 失敗）。

## 8. Playwright 驗證清單

`npm run dev`，開 `http://localhost:3000/index.html`。手機視窗以 `browser_run_code_unsafe` 建立 CDP session：`Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor, mobile: true })`＋`Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 5 })`，再 reload；先以 `matchMedia("(pointer: coarse)").matches` 確認觸控媒體特徵生效，否則改用 `browser.newContext({ viewport, deviceScaleFactor, isMobile: true, hasTouch: true })`（第 3 節）。截圖存 scratchpad。

視窗：**M1** 390×844 DPR 3、**M2** 360×740 DPR 3、**M3** 768×1024 DPR 2、**M4** 844×390 DPR 3（橫向）；桌面 **D1** 1440×900 DPR 1、**D2** 1024×768 DPR 1。

**基準**（第 10 節步驟 2，在 `main` 上、改程式前）：D1／D2 各記錄 (a) 關鍵元素 computed style 快照（`#appHeader` 的 `position`、所有 header／核心一／核心二按鈕的 `height`、`#phaseBtnGrid`／`#kpiGrid` 的 `grid-template-columns`、`#simCanvas`／`#waveCanvas` 的 `getBoundingClientRect` 與 backing 尺寸）；(b) hsu 模型、暫停於 15%、derive 完成後的 `simCanvas.toDataURL()`、`waveCanvas.toDataURL()` 雜湊；(c) 全頁截圖。元素尚無 id 時以既有 id 或 DOM 路徑取得。

| # | 視窗 | 情境 | 期望 |
| - | ---- | ---- | ---- |
| P1 | M1–M4 | 載入、等 derive 完成；腳本列出所有可見元素中 `getBoundingClientRect().right > innerWidth + 0.5` 或 `left < -0.5` 者；並列出 `#videoHud`、`#simStage`、`#phaseTimingPanel`、`#kpiGrid` 子元素中 `scrollWidth > clientWidth + 1` 者 | 兩份清單皆空（報告浮層未開） |
| P2 | M1–M3 | 所有可見的 `button`、`select`、可見 `input`（不含 range）、內含 file input 的 `label`、`#liveSyncLabel` 量測 | 高與寬皆 ≥ 44 |
| P3 | M1–M3 | 所有可見 `input`、`select` 的 computed `font-size` | ≥ 16px |
| P4 | M1、D1 | `#appHeader` computed `position` | M1 `static`；D1 `sticky` |
| P5 | M1、M2、D1 | `simCanvas`、`waveCanvas`：顯示框寬高比、backing 尺寸 | M1／M2：`simCanvas` 顯示比 = 700/480 ±1%、`waveCanvas` = 720/150 ±1%；backing = 邏輯尺寸 × scale（scale 依第 6.5 節公式，M1 約 1.5）；D1：700×480、720×150 |
| P6 | M1、M2 | `#simLegend`、`#simHud` 與 `#simCanvas` 的矩形交集；`#videoHud` 與 `#videoOverlayCanvas` 交集 | 交集面積 0；`#videoHud` 兩列文字完整可見 |
| P7 | M1（觸控）、D1 | `#dropHintTouch`、`#videoCaptureLabel`、`#videoCaptureLabelBar`、`#dropHintDesktop` 可見性 | M1：前三者可見、後者隱藏；D1：相反 |
| P8 | M1 | 以 `browser_file_upload` 對 `#navVideoUploadInput` 選 `.temp/mp4/woman03 - Trim.mp4`；按擷取 | 影片載入、Profile 切到實測影片、`POST /api/analyze` 200、`POST /api/derive` 200；空狀態浮層在載入前完整可見（截圖） |
| P9 | M1 | CDP `Input.dispatchTouchEvent` 在 `simCanvas` 上：(a) 水平拖 100px；(b) 垂直拖 150px；(c) 單點 | (a) 循環暫停、`cyclePct` 變化 ≈ `100 / 顯示寬 × 100`（±2）、`#cycleSlider` 同步；(b) `cyclePct` 不變（頁面捲動為盡力觀察，實機確認）；(c) 無變化 |
| P10 | D1 | 滑鼠在 `simCanvas` 上拖曳 | `cyclePct`、播放狀態不變 |
| P11 | M1 | 匯出報告：浮層開啟、P1 腳本只看浮層內元素；`emulateMedia({ media: "print" })` 後 computed style；`page.pdf({ format: "A4" })` | 浮層無橫向溢出、工具列輸入框寬度 ≤ 視窗；列印 computed style 與 3.8 P2 相同（主畫面隱藏、`.rp-toolbar` 隱藏、`#reportOverlay` `static`、白底）；PDF 頁數與 D1 相同，報告骨架圖 `naturalWidth` = 700 |
| P12 | D1、D2 | 重做「基準」(a)(b)(c) | (a) 與基準全等；(b) 兩個雜湊與基準相同；(c) 目視無差異 |
| P13 | D1 | AGENTS 第 4 點：切換 Profile、播放骨架動畫、選擇影片、拖入影片（`#videoDropZone` drop）、匯入 walk JSON（103／361ms／96）、匯出 JSON、匯出報告 | 正常 |
| P14 | M1、M3 | 觸控 tap：切換 Profile、播放／暫停、上一格／下一格、四相位按鈕、診斷卡「定格檢視」、圖層開關、速度切換、匯入 walk JSON | 正常，數值同 P13 |
| P15 | 全部 | console 與網路 | console 0 error；本站資源無 4xx（Tailwind CDN 的 production 警告為 warning，不計） |

## 9. 使用者待驗清單（實機）

在 iPhone（Safari）與 Android（Chrome）各一台執行，記錄機型、系統版本、結果（第 16 節第 1 點決定使用部署網址或區網）。

1. 直向與橫向：無橫向捲動、文字可讀、圖例與 HUD 不遮骨架、header 不黏頂。
2. 從相簿／檔案 App 選影片：iPhone 的 `.mov`（HEVC）、Android 自拍 `.mp4`；Android 選從 iPhone 傳來的 HEVC 檔時應出現第 6.7 節提示而非空白。
3. 「📹 拍攝影片」：開後鏡頭、拍完自動載入；確認影片是否存入相簿（預期 iOS 不存）。
4. 擷取：MediaPipe Heavy 載入秒數、擷取總耗時、手機是否明顯發熱、是否完成並顯示評分；記錄於 Notes 或回報（效能問題另開 Feature）。
5. 骨架：水平拖曳換格順暢、垂直滑動畫布仍能捲動頁面、快速連點「下一格」不觸發頁面縮放。
6. 輸入框：聚焦身高／步頻／步幅時不自動放大、出現數字鍵盤；雙指仍可縮放頁面。
7. 匯入 JSON（從檔案 App／下載資料夾，JSON 不應變灰）、匯出 JSON（iOS 存到「檔案」、Android 下載資料夾）。
8. 報告：開啟、捲動、編輯顯示名稱；iOS「分享 › 列印 › 存成 PDF」、Android「列印 › 另存為 PDF」；PDF 與桌面版版面一致。
9. Retina／高 DPR 下骨架線條與波形圖清晰。
10. （若有）iPad 直向與橫向：可操作、按鈕夠大。

發現問題時記錄重現步驟，以 `fix-mobile-<名稱>` 另開分支處理，不重開 5.1。

## 10. 實作步驟

1. 開 branch `feature-mobile-ui`；依 AGENTS 讀 Next 文件（第 3 節）並查證瀏覽器行為，寫入 Notes。
2. 在 `main`（改程式前）啟動 `npm run dev`，記錄第 8 節「基準」與 360×740 的現況量測（第 2 節標「量測」項）；計算 `main.css` 正規化後的 SHA-256，寫入 W3 常數與 Notes。
3. `index.html`：加 id 掛鉤、觸控元素、`?v=5.1`、`#jsonImportInput` accept。
4. `main.css`：末端加 5.1 區段（T → P → H 順序）。
5. `renderer.js`：邏輯尺寸、`fitCanvasResolution`、`ResizeObserver`；`report.js` 截圖固定尺寸。
6. `ui.js`：觸控拖曳、`onerror` 提示。
7. 寫 W 組測試並做第 7 節「故意改錯」；Playwright 第 8 節；同步文件；Notes 寫入 `context/current-feature.md`。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `README.md` | 「目前狀態」加「5.1：手機版 UI（RWD、觸控、拍攝影片、畫布高 DPR）完成，實機待驗見規格第 9 節」 |
| `docs/planning/epics-and-features.md` | 5.1 列改 `done`，一句結論（舊頁面 RWD、無新依賴、Playwright 手機視窗驗證、實機待驗清單）並連到本規格 |
| `docs/privacy.md` | 影片段落補一句：「手機上以『拍攝影片』錄下的影片與選擇的檔案相同，只在瀏覽器本機播放與擷取 landmarks，不上傳；部分系統不會自動存入相簿」 |
| `docs/deployment.md` | 第 5 節瀏覽器手動清單補一行：「手機實機檢查見 `context/features/5-1-mobile-ui.md` 第 9 節」 |

`docs/client-server-boundary.md`、`docs/server-api.md`、`docs/analysis-json-contract.md`、`AGENTS.md` 不改（無演算法、API 或契約變更）。

## 12. 驗收標準

1. `npm run build`、`npm run lint` 通過。
2. `REQUIRE_BASELINE=1 npm test` 全過、基準不變；W1–W10 通過；第 7 節四個故意改錯都會失敗並已還原。
3. P1–P15 通過，結果與截圖路徑寫入 Notes。
4. `git diff --stat main -- lib app public/modules next.config.mjs vercel.json package.json scripts` 為空；`git diff main -- public/index.html` 中沒有任何被刪除或修改的既有 `class="…"`。
5. 文件依第 11 節更新；`.temp/` 未提交。
6. 第 9 節使用者待驗清單已交給使用者（complete 不以實機結果為條件，第 16 節第 1 點）。

## 13. Verification

依 `AGENTS.md` 順序，結果寫入 Notes。

1. `npm run build`、`npm run lint`。
2. `REQUIRE_BASELINE=1 npm test` 記錄基準數值；再跑一次 `npm test`；第 7 節故意改錯並還原。
3. `npm run dev`，Playwright 依第 8 節：先 D1／D2 基準比對（P12），再 M1–M4（P1–P11、P14），最後 P13、P15。另以 `curl -i http://localhost:3000/styles/main.css?v=5.1` 確認 200 `text/css`。
4. 互動（AGENTS 第 4 點）：桌面 P13、手機 P14。
5. 文件核對（第 11 節逐條）；`git status` 只有本 Feature 的檔案。

## 14. 風險與已知限制

- **Playwright 模擬不等於實機**：觸控捲動與 `touch-action`、iOS 自動放大、檔案選擇器、`capture`、HEVC 解碼、MediaPipe 效能都只能實機確認（第 9 節）。
- **MediaPipe Heavy 在手機可能很慢或記憶體不足**：本 Feature 不調校；若實機無法完成擷取，另開 Feature（Lite 模型或降解析度）。
- **Tailwind Play CDN 的注入位置**：若日後換成建置版 Tailwind 或改變載入順序，5.1 的 id 選擇器仍有較高特異度，但 W3 雜湊會在 `main.css` 被動到時提醒重算。
- **`body { overflow-x: hidden }` 會遮蔽溢出**：P1 以元素矩形檢查，而非只看 `scrollWidth`；新增內容時仍可能有被靜默裁切的情況。
- **DPR 放大的成本**：DPR 3 手機 backing store 約 1050×720，每幀全畫面重繪；若實機掉幀，scale 上限可降為 2（第 15 節第 5 點）。
- **Retina 桌面畫面變清晰**：屬像素差異，不在第 6.9 節「零回歸」的 DPR 1 比對範圍。
- **iPad 橫向（≥ 1024、觸控）維持桌面版面**：只放大觸控目標；版面是否足夠好用待實機回報。
- **`capture` 拍攝的影片可能不存相簿**：使用者若想留檔，應先用相機 App 拍再選檔；按鈕旁已註明。
- **hover-only 的 `title` 提示**：相位色段的 tooltip 在觸控上看不到，資訊另有文字呈現，不處理。

## 15. 待決定（start 時先採預設）

1. **斷點**：640／1024 對齊 Tailwind，T／P／H 三個查詢（**建議**）／自訂斷點。
2. **骨架拖曳**：觸控與筆才啟用（**建議**）／滑鼠也啟用／不做、只放大 slider。
3. **拍攝按鈕**：觸控裝置額外顯示 `capture="environment"` 按鈕（**建議**）／不加、靠系統選單。
4. **手機 header 精簡**：隱藏副標與 header 步幅群組（**建議**；banner 有同一輸入）／保留並換行。
5. **畫布解析度**：依顯示寬度 × DPR 放大、0.25 倍數、上限 3、需求 ≤ 1.25 維持 1（**建議**）／上限 2／只做 CSS 縮放。
6. **影片解碼失敗提示**：加 `onerror` 提示（**建議**）／不做。
7. **JSON accept**：`.json,application/json`（**建議**）／維持 `.json`。
8. **報告截圖尺寸**：固定 700×480（**建議**，PDF 與 3.8 相同）／依 backing store 解析度。

## 16. 未決事項（需要使用者回答）

1. **實機驗證方式與時機**：(a) 部署後用 Vercel 網址（需先完成 4.1 的使用者部署）；(b) 本機 `npm run build && npm start -- -H 0.0.0.0`，手機在同一 Wi-Fi 開 `http://<電腦 IP>:3000/index.html`（需開放防火牆 3000 埠；同源檢查以 `Host` 比對，可正常呼叫 API）。預設：5.1 以 Playwright 結果 complete，實機清單由你在方便時執行並回報，問題另開 `fix-`。
2. **iPad 橫向與觸控筆電**：寬 ≥ 1024 的觸控裝置維持桌面版面、只放大觸控目標，可以接受嗎？預設：可以；若實機覺得難用，另開 Feature 調整。
3. **手機首屏優先順序**：手機上由上而下依序為 header → 步頻／步幅／配速 → 核心一（影片）→ 核心二（骨架）→ 評分 → 診斷（沿用桌面順序）。是否希望把「核心二骨架」或「評分」提到影片之前？預設：沿用現有順序（不調整 DOM 順序，降低回歸風險）。
