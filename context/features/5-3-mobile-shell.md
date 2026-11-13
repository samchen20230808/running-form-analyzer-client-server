# Feature 5.3 — 手機版三區殼層（Logo／常駐操作區／主題區）

## Status

`done`（第 12 節皆採預設；實作細節差異見 current-feature Notes）

## Epic

Epic 5 — PWA 與手機版 UI（編號 5.3；5.2 PWA 仍為 planned，兩者互不依賴）

## Objective

把手機（≤ 639.98px）頁面重整為三區：

1. **Logo 區**：2 行（標題＋版本徽章／Logo），說明文字手機不顯示（只在非手機版出現）。隨頁面捲走。
2. **常駐操作區**（sticky，3 行）：
   - 第 1 行：身高、步幅、步頻、配速。
   - 第 2 行：目前分析影片（`#profileSelect`，上傳後顯示 `🎥 影片: 檔名`）、上傳影片、載入 JSON。
   - 第 3 行：主題切換鍵 **核心一｜核心二｜分析**。
3. **主題區**：核心一、核心二一次只顯示一個（切換不捲頁、留在本頁）；「分析」鍵平滑捲到下方分析區，分析區照常可下捲。

**已由使用者決定**：

- 匯出 JSON／報告放到「分析」區頂端；凡屬某主題的控制項（核心一的夜間增亮、方向、機位、影片上傳／拍攝；核心二的圖層、速度）**跟著該主題**，不放常駐區。
- 步幅「改回 AI 自動」是操作：平常不佔位，點步幅旁的狀態標籤才**彈出**小面板，操作完（或點外面）自動收起，恢復正常。
- 新 Feature（本檔），不是 fix。
- Logo 說明（`#navSubtitle`）省略，只在非手機版顯示。

**行為不變**：`lib/**`、`app/**`、API、`next.config.mjs`、`package.json`、`APP_CONFIG` 不改；桌面（≥ 640px 的版面）逐項不變；評分與 baseline 不受影響（walk 103／361ms／96）。

## 1. 目標與非目標

### 目標

1. 390×844、360×740 下三區如上；常駐區高度 ≤ 約 150px；無橫向溢出；觸控目標 ≥ 44px、輸入字級 ≥ 16px（延續 5.1）。
2. 既有 JS 對這些控制項的讀寫（`onManualStrideInput`、`resetStrideToAuto`、`switchProfile`、`handleHeaderVideoUpload`、`report.js` 讀 `#topCadenceInput`／`#bannerStrideInput` 等）**零修改**。
3. 切換主題不影響已擷取的資料、不重新分析；核心二畫布在被隱藏再顯示後正確重繪。
4. 桌面與平板（≥ 640px）DOM 位置與外觀與 5.1 完成後完全相同。

### 非目標

- 桌面版重新設計、新增依賴、React 化。
- 核心一／核心二的內部功能變更（只調手機排版密度）。
- PWA、MediaPipe 效能。
- 橫向（844×390）專屬排版（只要求可用、不溢出）。

## 2. 現況（讀碼）

| 項目 | 位置 | 現況 |
| ---- | ---- | ---- |
| Header | `index.html:68–214` | `#appHeader`（5.1 起手機 `position: static`）；左為 Logo＋標題＋版本徽章＋`#navSubtitle`，右為 `#headerToolbar`（身高、步幅群組、上傳、載入 JSON、`#profileSelectGroup`、匯出 JSON、匯出報告） |
| Banner | `:221–330` | `#dashBanner`：hero 標題／說明（`#heroTitle`、`#heroDesc`）、步頻 `#topCadenceInput`、步幅 `#bannerStrideInput`＋`#strideSourceBadge`＋「重設自動」、配速 `#topPaceVal`／`#topSpeedVal` |
| 步幅雙輸入 | `derive.js:103–105`、`analyzer.js:517–518` | `#customStrideInput`（header）與 `#bannerStrideInput` 兩個都由 JS 寫入，`report.js` 讀 banner 那個 |
| 工作區 | `:333` | `<section>` 內 `#coreOneCard`（核心一）與 `#coreTwoCard`（核心二）；手機單欄堆疊 |
| 分析 | `:938`、`:1313` | 評分／KPI／相位／波形、診斷卡兩個區塊 |
| 畫布 | `renderer.js` | `fitCanvasResolution` 在尺寸為 0 時回傳 `null`；`ResizeObserver` 重新顯示時會觸發（5.1） |

## 3. 作法比較

### 3.1 常駐區的控制項怎麼集中

| 選項 | 評估 |
| ---- | ---- |
| **A. 手機時用 JS 把既有節點搬進 `#mobileBar`，回桌面搬回原位（建議）** | 節點原樣搬移，ID、事件、`oninput` 不變，沒有重複 ID；需要記錄原位置（用佔位註解節點／`data-home`）才能雙向還原 |
| B. 新增手機專用重複控制項 | 重複 ID 或需同步程式；與 `report.js` 讀值契約衝突，風險高 |
| C. 純 CSS（`display: contents` 攤平＋grid order） | 不用 JS，但 header 與 main 跨容器、sticky 與包含區塊行為脆弱，難以驗證 |

### 3.2 主題切換

| 選項 | 評估 |
| ---- | ---- |
| **A. 核心一／二以 `data-mobile-tab` 屬性＋CSS 一次顯示一個；「分析」為捲動錨點（建議）** | 不改核心 JS；分析區照常渲染，符合「分析可下捲」 |
| B. 三個都做成互斥分頁 | 分析內容很長，分頁式會失去自然捲動，不採用 |

## 4. 範圍

```
public/index.html          # 加 id 掛鉤（#mobileBar、#mobileTabs、#strideChip、#stridePopover、#analysisActions、#analysisAnchor、#coreSection）、
                           # 手機專用新元素（皆預設 hidden）；不改既有 class
public/styles/main.css     # 末端新增「5.3」區段（沿用 5.1 的標記／媒體查詢／id 選擇器規則）
public/js/mobile-shell.js  # 新檔：節點搬移、主題切換、步幅彈出面板
tests/legacy-client.test.js# 新增 describe；重算 main.css 區段外雜湊（若 5.1 區段被延伸）
README.md、docs/planning/epics-and-features.md、context/current-feature.md
```

不改：`lib/**`、`app/**`、`public/modules/**`、`public/js/{config,state,pose,derive,analyzer,renderer,report,ui}.js`（若實測需微調再於 Notes 記錄）。無新依賴。

## 5. 設計決策

### 5.1 三區結構（手機）

```
#appHeader ─ Logo 區（icon＋標題＋版本徽章；#navSubtitle、#dashBanner 的 hero 區隱藏）
#mobileBar（sticky top:0，z-40，背景不透明）
  ├ 第 1 行  身高｜步幅(+#strideChip)｜步頻｜配速（grid 4 欄）
  ├ 第 2 行  #profileSelect（flex-1，截斷長檔名）｜📂 影片｜📂 JSON
  └ 第 3 行  #mobileTabs：核心一｜核心二｜分析（三等分）
#coreSection  一次顯示 #coreOneCard 或 #coreTwoCard
#analysisAnchor ＋ #analysisActions（匯出 JSON／匯出報告）＋ 既有分析區塊
```

- 搬進 `#mobileBar` 的節點：身高群組、步幅 `#bannerStrideInput`（header 的 `#headerStrideGroup` 沿用 5.1 隱藏）、`#topCadenceInput`、`#topPaceVal`、`#profileSelectGroup`、兩個上傳 `<label>`。步頻／配速的徽章（`#topCadenceBadge`、`#topSpeedVal`）留在原 banner 容器內並隱藏（`report.js` 仍可讀）。
- 搬進 `#analysisActions` 的節點：匯出 JSON、匯出報告兩個按鈕。
- 第 1 行每格只留「標籤＋輸入」，標籤縮成 10–11px，輸入 16px、高 44px；配速格顯示 `#topPaceVal`＋單位 `/km`。
- 常駐區 3 行 ≈ 44×3 + 間距 ≈ 150px。若實測擠壓影片區，退路（第 12 節第 1 點）：只讓第 3 行 sticky。

### 5.2 `mobile-shell.js`

- 以 `matchMedia("(max-width: 639.98px)")` 監聽；進入手機：記錄每個節點原位（`document.createComment` 佔位），依序 `appendChild` 搬入目標容器；離開手機：搬回佔位處。冪等（重複觸發不出錯）。
- 頂層以 `getElementById` 取元素，不依賴載入順序。
- 主題切換：`#mobileTabs` 三顆按鈕，`aria-pressed` 反映狀態。
  - 核心一／核心二：在 `#coreSection` 設 `data-mobile-tab="one|two"`；CSS 以此隱藏另一張卡；切換時捲到 `#coreSection` 頂端（若已在上方則不動）。
  - 分析：`scrollIntoView({ behavior: "smooth", block: "start" })` 到 `#analysisAnchor`，並扣除 sticky 高度（`scroll-margin-top`）。
  - 捲動到分析區時 tab 高亮「分析」，回到上方高亮目前核心（IntersectionObserver，降級為點擊時才更新）。
  - 預設進入頁面為核心一。
- 桌面（非手機）：不加任何屬性、不隱藏任何卡，行為與現況相同。
- 核心二顯示時呼叫 `window.dispatchEvent(new Event("resize"))` 不需要；`ResizeObserver` 已涵蓋，實測不行才補。

### 5.3 步幅「改回 AI 自動」彈出面板

- 步幅格右上角有 `#strideChip`（顯示 `AI` 或 `手動`，取自 `#strideModeBtn`／`#strideSourceBadge` 文字；觸控區 44×44，視覺小）。
- 點 `#strideChip` → 顯示 `#stridePopover`（錨定在第 1 行下方，絕對定位、不推擠版面）：說明來源（`#strideSourceBadge` 文字）＋「改回 AI 自動」按鈕（呼叫既有 `resetStrideToAuto()`）。
- 按下按鈕、點面板外、按 Esc、或切換主題 → 自動關閉；關閉後回到正常 3 行，不留殘影。
- 步幅輸入本身仍直接在格內編輯（不進面板），行為與桌面一致。

### 5.4 主題區內部（手機密度，只調排版）

- 核心一工具列（夜間增亮、方向、機位、上傳／拍攝）整理成緊湊的一到兩行，控制項仍 ≥ 44px；已在 5.1 的 HUD／疊層調整沿用。
- 核心二圖層、速度、上一格／下一格、四相位按鈕沿用 5.1，並使整張卡在 390×844 下盡量一屏內可操作（以實測為準，超出時卡內自然下捲）。
- 「留在本頁」的定義：切換核心一／二不會跳到頁面別處、不重新載入；卡高度超過一屏時頁面自然捲動屬預期。

### 5.5 桌面零回歸

- 區段內規則一律在 `@media screen and (max-width: 639.98px)` 內（沿用 5.1 的 P 查詢字串，逐字），不含 `print`、`!important`。
- 新增元素 `#mobileBar`、`#mobileTabs`、`#stridePopover` 預設 `hidden`（Tailwind `hidden`）；手機 CSS 以 id 規則顯示。`#analysisActions` 在桌面為空容器且隱藏。
- 桌面 DOM 在 `mobile-shell.js` 不動作時與現況相同（P12 式比對）。

## 6. 測試計畫

**既有測試**：全部照舊；5.1 的 W3「區段外雜湊」若需調整以規格註明並重算。

**新增 describe「X 5.3 手機版三區殼層」**

1. **X1 區段與查詢**：5.3 區段有開始／結束標記；每條規則在 P 查詢內；選擇器皆以 `#` 開頭；引用的 `#id` 在 `index.html` 各恰一次。
2. **X2 掛鉤**：`#mobileBar`、`#mobileTabs`、`#strideChip`、`#stridePopover`、`#analysisActions`、`#coreSection` 存在且唯一；新元素 class 含 `hidden`；既有 class 字串無變更（diff 檢查）。
3. **X3 腳本**：`mobile-shell.js` 含 `matchMedia`、`639.98px`、`aria-pressed`、`scrollIntoView`、`resetStrideToAuto`；不含 `touchstart`／`"mousedown"`、不含 `fetch`／儲存 API（承接既有「不使用瀏覽器儲存與其他外送通道」測試，自動涵蓋）。
4. **X4 契約**：`report.js` 仍以 `getElementById("topCadenceInput")`／`("bannerStrideInput")`／`text("topPaceVal")` 讀值（節點搬移不改 ID）。
5. 故意改錯各一次再還原：新增一條 P 外的規則（X1 失敗）、刪掉 `#mobileTabs`（X2 失敗）。

## 7. Playwright 驗證

視窗：M1 390×844、M2 360×740、M3 768×1024、M4 844×390；D1 1440×900。

| # | 情境 | 期望 |
| - | ---- | ---- |
| S1 | M1／M2 載入 | 三區順序正確；Logo 區 2 行、無副標；常駐區 3 行、高 ≤ 150px；無橫向溢出（沿用 5.1 P1 腳本） |
| S2 | M1 捲動 | `#mobileBar` 持續貼頂（`getBoundingClientRect().top` 為 0）；Logo 區捲走 |
| S3 | M1 切換核心一／二 | 一次只顯示一張卡；切換不改頁面捲動位置（頂端狀態）；核心二畫布顯示後 backing 尺寸正確、骨架已繪製 |
| S4 | M1 點「分析」 | 捲到分析區頂端（未被 sticky 蓋住）；匯出 JSON／報告在分析區頂端；tab 高亮「分析」；往上捲回則高亮核心 |
| S5 | M1 步幅 | 直接改步幅 → 配速即時更新、`#customStrideInput` 同步；點 `#strideChip` → 彈出；按「改回 AI 自動」→ 自動收起、值回 AI；點外面／Esc／切換 tab 亦收起 |
| S6 | M1 影片 | 常駐區上傳影片 → 載入、`POST /api/analyze` 200、`/api/derive` 200；`#profileSelect` 顯示 `🎥 影片: 檔名` 且不撐破版面（截斷） |
| S7 | M1 載入 JSON | walk 樣本 103／361ms／96；匯出報告內步頻／步幅／配速正確（節點搬移後仍可讀） |
| S8 | M1 → D1 縮放 | 在同一頁把視窗由 390 拉到 1440：節點搬回原位、所有卡同時可見、無殘留 hidden；再縮回 390 正常（冪等） |
| S9 | D1／D2 | 版面、computed style 與 5.1 完成後的基準全等；`simCanvas`／`waveCanvas` 雜湊不變 |
| S10 | M1 觸控 | 所有可見 button／select／input／label ≥ 44×44（range 除外）、input 字級 ≥ 16px |
| S11 | 全部 | console 0 error；本站資源無 4xx |

## 8. 實作步驟

1. 開 branch `feature-mobile-shell`；讀 `node_modules/next/dist/docs/` 中 `public` 靜態檔相關段落，確認無變更。
2. 在 `main` 先記 D1／D2 基準與 5.1 區段／雜湊現況。
3. `index.html`：加 id 掛鉤與手機專用元素、載入 `js/mobile-shell.js`（版本參數）。
4. `main.css`：加 5.3 區段。
5. 寫 `mobile-shell.js`；手動走第 7 節。
6. 寫 X 組測試、做故意改錯；文件同步（README、epics 5.3 列、Notes）。

## 9. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `README.md` | 「目前狀態」加 5.3 |
| `docs/planning/epics-and-features.md` | Epic 5 新增 5.3 列（planned → done） |
| `context/current-feature.md` | Notes |

## 10. 驗收標準

1. `npm run build`、`npm run lint` 通過。
2. `REQUIRE_BASELINE=1 npm test` 全過、基準不變；X 組通過、故意改錯會失敗並已還原。
3. S1–S11 通過，結果與截圖路徑寫入 Notes。
4. `git diff main -- lib app public/modules next.config.mjs vercel.json package.json` 為空；`index.html` diff 無既有 `class` 被修改或刪除。
5. 文件依第 9 節更新。

## 11. 風險與已知限制

- **節點搬移**是最大風險：搬移時若 JS 於其他時機以位置（如 `parentElement`）取元素會失效。實作前先全專案搜尋；測試 S7 覆蓋 `report.js`。
- **常駐區佔高**：約 150px，影片區變小；備案為只讓第 3 行 sticky。
- **一次只顯示一張核心卡**：手機上看不到核心一「1:1 即時驅動」與核心二同步呈現；屬預期取捨。
- **MediaPipe 手機效能**、實機驗證：沿用 5.1，不在本 Feature；實機（iOS／Android）待使用者驗：sticky、彈出面板、鍵盤彈出時常駐區是否被擠壞。
- 手機鍵盤彈出時 sticky 元素在部分瀏覽器會浮動，實機確認。

## 12. 未決事項（start 時先採預設）

1. **sticky 範圍**：預設整個 `#mobileBar`（3 行）sticky；若影片區太擠，改為只 sticky 第 3 行。
2. 「分析」分頁高亮是否用 IntersectionObserver：預設是，失敗則點擊時更新。
3. 核心一／二預設載入核心一：預設是。
