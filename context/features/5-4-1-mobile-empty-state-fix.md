# Fix 5.4.1 — 手機觸控裝置核心一空狀態重疊與相位按鈕換行

## Status

`done`（實機待驗）

## Epic

Epic 5 — PWA 與手機版 UI（5.4 的修正；branch `fix-mobile-empty-state`）

## Objective

5.4 上線後，使用者在實機（Android，視窗約 412×737 CSS px，觸控）回報：

1. **核心一空狀態重疊**：未載入影片時，空狀態疊層的「點下方按鈕選擇或拍攝跑步影片」與「📂 選擇影片檔」被 AI 狀態 HUD（`#videoHud`）蓋住；「⚡ 預覽徐國峰標準動作訊號」底部被裁掉。
2. **核心二相位按鈕換行**：「2. 關鍵跑姿」斷成兩行，四顆按鈕高度不一致。

5.4 驗證用桌面 Chromium（非 `pointer: coarse`），所以沒抓到 1。本修正同時補上「模擬觸控裝置」的 Playwright 驗證。

**已由使用者決定**：只做以上兩點；頂部固定區縮小、載入影片後 HUD 單行化、骨架畫布取景留給之後的 5.5。

**行為不變**：`lib/**`、`app/**`、API、所有 JS（含 `mobile-shell.js`）、桌面與平板（≥ 640px）版面、`APP_CONFIG`、baseline（103／361ms／96）。

## 原因

- 觸控裝置規則（`main.css` 5.1 區段 `@media (hover: none) and (pointer: coarse)`）讓空狀態多出第三顆 `#videoCaptureLabel`（📹 拍攝影片＋小字說明），三顆按鈕的總高超過手機上的影片區（約 300px）。
- 5.4 給 `#videoEmptyOverlay` 的 `padding-top: 56px` 是為了避開 HUD，但實機 HUD 約 75px 高。
- 空狀態時 HUD 只顯示「待命中」與 0 值，沒有資訊；而核心一標題列（`#coreOneHead`）已有「📂 上傳影片」「📹 拍攝影片」，空狀態裡的兩顆按鈕在手機上是重複的。
- 相位按鈕標籤為 `text-xs`，在約 80px 寬的按鈕內會換行。

## 設計

全部改動放在**既有 5.4 CSS 區段內**（`/* 5.4 手機版核心一／二一屏：開始 */` 與 `結束` 之間，同一個 `@media screen and (max-width: 639.98px)`），不新增區段，維持 N1／N2 的規則：只用 `#` 開頭選擇器、無 `!important`。

### 1. 核心一空狀態（手機）

- 空狀態時隱藏 HUD：`#videoEmptyOverlay:not(.hidden) ~ #videoHud { display: none; }`
  - 實作前先確認 `#videoHud` 是 `#videoEmptyOverlay` 之後的兄弟節點（目前 `index.html` 是如此）；若不是，改用 `#videoDropZone:has(#videoEmptyOverlay:not(.hidden)) #videoHud`。
  - `#videoEmptyOverlay` 由 `ui.js` 以 `.hidden` 切換；載入影片後 HUD 照常顯示（5.4 的疊層樣式不變）。
- 隱藏空狀態裡的兩顆上傳 label（選擇影片檔、拍攝影片），保留「⚡ 預覽徐國峰標準動作訊號」按鈕：`#videoEmptyOverlay label { display: none; }`
  - 特異度 (1,0,1) 高於 5.1 觸控規則 `#videoCaptureLabel`（1,0,0），兩者都在手機時以本規則為準；請以 Playwright 實測確認。
  - `#videoCaptureInput` 在 label 內，隱藏後不影響標題列的拍攝按鈕（`#videoCaptureLabelBar` 有自己的 input）。
- HUD 不再佔位，`#videoEmptyOverlay` 的上內距從 56px 改為 12px（修改 5.4 既有那條規則，不要另寫一條互相覆蓋）。
- 文案：`#dropHintTouch` 的「點下方按鈕選擇或拍攝跑步影片」改為「點按鈕選擇或拍攝跑步影片」（手機按鈕在上方、平板在下方，用中性說法）。這是唯一的 HTML 文字變更。

### 2. 核心二相位按鈕（手機）

- 標籤不換行、字級縮小：`#phaseBtnGrid button > div:first-child > span { white-space: nowrap; font-size: 11px; }`，並加 `overflow: hidden; text-overflow: ellipsis; max-width: 100%;` 作保險。
- 不改按鈕文字、不改 JS（`ui.js` 不寫這些標籤）。

### 3. 快取版號

- `index.html` 的 `styles/main.css?v=5.4` → `?v=5.4.1`（使用者實機曾因舊頁面停留看到舊版）。`mobile-shell.js` 未改，版號不動。
- 同步更新 `tests/legacy-client.test.js` W6 的版號斷言。

## 範圍

```
public/styles/main.css      # 只改 5.4 區段內
public/index.html           # #dropHintTouch 文案、main.css 版號
tests/legacy-client.test.js # W6 版號；新增 N5（見下）
README.md（若有記載 5.4 行為或版號）、docs/planning/epics-and-features.md（新增 5.4.1 一列）、context/current-feature.md
```

### 新增測試 N5（字串層級，放在 N 組）

- 5.4 區段含 `#videoEmptyOverlay:not(.hidden) ~ #videoHud`（或 `:has` 版本）與 `#videoEmptyOverlay label`，且其宣告含 `display: none`。
- 5.4 區段含 `#phaseBtnGrid` 的 `white-space: nowrap`。
- `#dropHintTouch` 文字不再含「下方」。

## 驗證

1. `npm run build`、`npm run lint`、`REQUIRE_BASELINE=1 npm test`（基準 103／361ms／96 不變）。
2. Playwright **模擬觸控裝置**：用 `browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })` 開新頁（MCP 的 `browser_run_code_unsafe` 可取 `page.context().browser()`），先斷言 `matchMedia('(pointer: coarse)').matches === true`，否則此驗證無效。尺寸：412×737、390×700、375×667、360×740。每個尺寸：
   - 核心一空狀態：`#videoHud` 不可見；`#videoEmptyOverlay` 內沒有 label 可見；提示文字、預覽按鈕的矩形完全在 `#videoDropZone` 矩形內，且與其他可見元素不重疊；`#coreOneCard` 底部 ≤ 視窗高。
   - 載入 `.temp/mp4/woman03 - Trim.mp4` 後：`#videoHud` 可見、`#videoEmptyOverlay` 隱藏。
   - 核心二：四顆 `#phaseBtnGrid` 按鈕高度相同、標籤 span 只佔一行（高度 ≈ 行高）；卡片底部 ≤ 視窗高。
   - 無橫向溢出；console 0 error。
   - 每個尺寸截圖存 scratchpad 供 review。
3. 桌面 1440、平板 768（含觸控模擬）：空狀態三顆按鈕與 HUD 照舊顯示（零變更）。
4. 互動：點「⚡ 預覽徐國峰標準動作」可播放；標題列「上傳影片」可選檔；擷取後 analyze／derive 200；匯入 walk JSON 步頻 103。

## 風險與限制

- `~` 兄弟選擇器依賴 DOM 順序；`:has` 需較新瀏覽器（Chrome 105+／Safari 15.4+），只在 fallback 情況使用。
- 手機空狀態不再有「選擇影片檔」大按鈕，改依標題列；若使用者覺得不明顯，5.5 再調整。
- 實機（iOS Safari、Samsung Internet）仍待使用者驗。
