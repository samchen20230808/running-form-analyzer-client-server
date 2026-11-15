# Fix 5.4.2 — 手機版 Logo 固定與核心二相位標題單行

## Status

`done`（實機待驗）

## Epic

Epic 5 — PWA 與手機版 UI（5.4 的修正；branch `fix-mobile-sticky-logo`）

## Objective

使用者實機（Android，約 412×737 CSS px）回報兩點：

1. **核心二地板忽上忽下**：骨架下方的相位標題（`#simPhaseTitle`），「2. 關鍵跑姿 (…)」是一行，「3. 落下 (右腿下落+Ground前段 32% vs 徐 30% • 🔵藍段)」是兩行。`#simHud` 高度隨文字變動，`#simCanvas`（`flex: 1`）跟著伸縮，地板線就上下跳。
2. **Logo 行為不一致**：按「分析」會把 Logo（`#appHeader`）捲出畫面，按「核心一／二」不會。更糟的是，從「分析」切回核心時 Logo 仍不見，主題卡片下方多出約 66px 空白（線上版實測 412×737：切回核心二後 `scrollY` 58、卡片底部 672）。

**已由使用者決定**：Logo 跟常駐區一起固定在頂端，三個分頁都看得到 Logo（接受主題區與分析區少約 58px）。

**行為不變**：`lib/**`、`app/**`、API、除 `mobile-shell.js` 以外的 JS、桌面與平板（≥ 640px）版面、`APP_CONFIG`、baseline（103／361ms／96）。

## 設計

### 1. 相位標題固定單行（CSS，5.4 區段內）

- `#simHud` 在手機已是 `display: flex`（5.4）。加 `flex-wrap: nowrap; min-width: 0;`。
- `#simPhaseTitle`：`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 auto;`；`#simPctText`：`flex: 0 0 auto;`。
- 被截掉的通常是「• 🔵藍段)」這類尾巴；同樣的資訊在畫布底部說明列與四顆相位按鈕都有，可以接受。
- 實作前先用 Playwright 看 `#simPhaseTitle` 在手機上的實際 computed `font-size`（實機截圖看起來比 5.4 設的 11px 大，可能被 `ui.js` 改寫 class 或被其他規則覆蓋）。若 5.4 的字級沒有生效，查清原因並修正，但**不改 `ui.js`**。

### 2. Logo 與常駐區一起固定（CSS＋`mobile-shell.js`）

`#appHeader` 與 `#mobileBar` 是 `body` 底下相鄰的兄弟節點，目前只有 `#mobileBar` 是 `position: sticky; top: 0`（5.3）。

- CSS（5.4 區段內）：`#appHeader { position: sticky; top: 0; z-index: 41; background: <與常駐區同色 #0b0f19 或原 header 底色，需不透明>; }`
  - 注意 5.1 有 `#appHeader { position: static; }`（`@media (max-width: 1023.98px), (pointer: coarse)`），5.4 區段在檔尾、同為 id 選擇器，後寫者勝；請實測確認。
  - 若 `#appHeader[data-shell="on"]` 等既有規則有影響，改用同樣特異度處理，不用 `!important`。
- `#mobileBar` 的 `top` 改為 Logo 高度：`mobile-shell.js` 在 `fitCore()`（進入手機與 resize 時都會跑）設定 `#mobileBar` 的 `style.top = <appHeader.offsetHeight>px`；`leave()` 時清掉（`style.top = ""`）。
- `fitAnchorMargin()`：`#analysisActions` 的 `scrollMarginTop` 改為 `appHeader.offsetHeight + mobileBar.offsetHeight + 8`，否則按「分析」時分析區頂端會被固定區蓋住。
- `showCore()`／`onScroll()` 以 `#mobileBar` 的 `getBoundingClientRect().bottom` 判斷位置；固定後它的 bottom 已包含 Logo，邏輯不用改，但要實測。
- `fitCore()` 的 `--chrome-h = header + bar + 16` 不變。
- 預期結果：任何分頁、任何捲動位置，Logo 與常駐區都在頂端；從分析切回核心時，主題卡片頂端在常駐區下方約 8px、底部 ≤ 視窗高，不再有空白。

## 範圍

```
public/styles/main.css      # 只改 5.4 區段內
public/js/mobile-shell.js   # fitCore 設 #mobileBar top、leave 清除、fitAnchorMargin 含 header
public/index.html           # main.css、mobile-shell.js 版號改 ?v=5.4.2
tests/legacy-client.test.js # W6 版號；新增 N6（見下）；若既有 M／N 測試對 mobile-shell.js 的字串檢查受影響則同步調整
docs/planning/epics-and-features.md（新增 5.4.2 一列，狀態 planned，complete 時才改 done）、context/current-feature.md
```

### 新增測試 N6（字串層級）

- 5.4 區段含 `#appHeader` 的 `position: sticky`、`#simPhaseTitle` 的 `white-space: nowrap` 與 `text-overflow: ellipsis`。
- `mobile-shell.js` 有設定 `mobileBar` 的 `style.top`，且 `scrollMarginTop` 的計算包含 `appHeader`。

## 驗證

1. `npm run build`、`npm run lint`、`REQUIRE_BASELINE=1 npm test`（改完後一定要用 `REQUIRE_BASELINE=1` 重跑；基準 103／361ms／96 不變）。
2. Playwright **模擬觸控裝置**（`browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })`，先斷言 `pointer: coarse` 為 true），尺寸 412×737、390×700、375×667、360×740：
   - **地板穩定**：載入影片並擷取（或「⚡ 預覽徐國峰標準動作」）後到核心二，依序點四顆相位按鈕（`#phaseBtn0`／`15`／`30`／`55`），每次記錄 `#simHud` 高度與 `#simCanvas` 的 top／height；四次必須完全相同，`#simPhaseTitle` 單行（高度 ≈ 一行行高）。也在播放中取樣幾次確認不變。
   - **Logo 固定**：載入後、按「分析」後、在分析區往下捲 800px 後、再按「核心一」與「核心二」後，各記錄 `#appHeader` top（須為 0）、`#mobileBar` top（須等於 header 高）、主題卡片 top／bottom（切回核心時須在常駐區下方且底部 ≤ 視窗高，下方無空白）。
   - 按「分析」後 `#analysisActions` 頂端在 `#mobileBar` 底部之下（不被蓋住），分頁高亮為「分析」；捲回核心區時高亮正確切回。
   - 無橫向溢出、console 0 error；截圖存 scratchpad `542/`（含：核心二四個相位各一張、分析分頁、從分析切回核心二）。
3. 桌面 1440、平板 768（含觸控）：`#appHeader` 定位與 5.4.1 相同、`#mobileBar` 隱藏且無 inline `top`，版面不變。視窗 390→1440→390 縮放後狀態正確（離開手機時 `style.top` 清掉）。
4. 互動：⚙ 設定面板開關仍正常（z-index 不被 Logo 蓋住：面板 60 > Logo 41）；步幅彈出面板位置正確；匯入 walk JSON 步頻 103；analyze／derive 200。

## 風險與限制

- 主題區與分析區各少約 58px；矮螢幕（360×600）更容易觸發 `min-height: 420px` 保底。
- 相位標題尾巴可能被截成「…」。
- iOS Safari 的 sticky 與網址列收合互動，待使用者實機驗。
