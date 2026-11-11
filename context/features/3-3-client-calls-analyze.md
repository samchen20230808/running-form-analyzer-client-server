# Feature 3.3 — Client 呼叫 `/api/analyze`

## Status

`done`（使用者已確認第 4.2 節切分：3.3–3.7 五個 Feature、報告匯出改為 3.8；第 13 節待決定採建議預設）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

讓 `public/legacy/` 的舊 Client 在**影片擷取完成時**，把擷取期間每一幀的 sanitized landmarks 以同源 `POST /api/analyze` 上傳，並以 Server 回傳的 `cadence`、`summary`、`cycleKeyframes` 建立 `custom_captured` profile。影片擷取路徑不再呼叫本地的 `analyzeCapturedFrames`。

依第 4 節的切分建議，**本 Feature 只做「擷取上傳＋套用結果」**。暫時核心（`public/legacy/temp-core/`）仍留著，負責繪圖、播放取樣、衍生值與其他本地重算。等 3.4–3.7 完成後才移除，部署防線也要到那時才拿掉。

**行為不變的部分**：`lib/` 不修改（`git diff --stat -- lib` 為空），`npm test` 的基準照舊：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150。

## 1. 目標與非目標

### 目標

1. 影片擷取（`triggerCycleExtraction` → `finalizeCycleExtraction`）改為上傳 landmarks、套用 API 結果。
2. 送出的資料完全符合 `docs/server-api.md` 的請求格式。Server 重跑方向偵測與閘門後，結果要與「同一批幀在本地分析」逐值一致（Verification 第 5 步用 temp-core 對照）。
3. 錯誤處理：400／403／413／415／422／429／500、網路錯誤、逾時都要提示使用者，**狀態保持不變**，console 不出 error。
4. 過時回應丟棄（請求進行中換了影片或重新擷取）；請求進行中不可重複觸發。
5. 刪除 `customCycleFrames` 死碼（決策文件第 9 章）。
6. 文件如實更新：`privacy.md`、`server-api.md`、README、AGENTS、決策文件、路線圖。

### 非目標（移到第 4 節的後續 Feature）

- `lib/player/`、`lib/landmarks/`、橋接機制（D1、D8）。
- `lib/profiles/` 烘焙、移除本地運動學退回路徑、`evaluateProfileCycle` 刪除、`getActiveRunnerTiming` 唯讀化、`renderSimVideo`、合成 landmarks 模擬擷取（D2、D3、D4、D9）。
- 契約 1.1.0（`metrics.gct`）、`POST /api/derive`、手動步頻／身高／機位／JSON 匯入改走 API（D5、D6、D7）。
- 移除 temp-core、移除 `VERCEL` 部署防線、bundle 不含核心的驗收。
- 無影片的模擬擷取（`js/analyzer.js:114–131`）：**本 Feature 仍走本地**（D9 在 3.5）。
- D10 UI 內嵌門檻、`fix-walking-hud-foot-label`、React 化、頁面 CSP、部署與 push。

## 2. 現況盤點（Client 對 temp-core 的依賴）

基準：本專案 `master` `bb06db5`，以 Grep 取得。`public/legacy/` 的行號與舊專案 `e29766d` 相同（temp-core 為 +3）。「處理」欄的 Feature 編號依第 4 節的建議切分。

| # | 位置 | 使用的 temp-core 名稱 | 用途 | 處理 |
| - | ---- | --------------------- | ---- | ---- |
| 1 | `js/analyzer.js:2` | `extractAnglesFromLandmarks` | 每幀角度、自動方向（`:10` `setRunDirection`） | 3.4（`lib/landmarks/`，D8 保留在瀏覽器） |
| 2 | `js/analyzer.js:52` | `evaluateCaptureFrame` | 擷取閘門、55 幀停止 | 3.4（同上；Server 重跑） |
| 3 | `js/analyzer.js:164` | `analyzeCapturedFrames` | 影片擷取的本地分析 | **3.3：改 `POST /api/analyze`** |
| 4 | `js/analyzer.js:117` | `evaluateProfileCycle` | 無影片模擬擷取（合成 45 幀角度） | 3.5（D9 合成 landmarks） |
| 5 | `js/analyzer.js:177–183` | `evaluateProfileCycle` ×21 | `customCycleFrames`（死碼） | **3.3：刪除** |
| 6 | `js/analyzer.js:225`、`:230` | `computePersonalizedPhaseTiming` | 匯入時正規化 `phaseTiming` | 3.7（D7，經 derive） |
| 7 | `js/analyzer.js:342`、`:348` | `evaluateProfileAngles`、`normalizeCycleKeyframes` | 匯入 profile 的 `evalCycle`、關鍵幀驗證 | 3.4（`lib/player/`）；退回分支 3.5 |
| 8 | `js/analyzer.js:453` | `getActiveRunnerTiming` | 匯出 `phaseTiming` | 3.5（D4 唯讀） |
| 9 | `js/config.js:67`、`:93`、`:120` | `evaluateProfileAngles` | 三個內建 profile 的 `evalCycle`（無關鍵幀，永遠退回） | 3.5（D3 烘焙） |
| 10 | `js/renderer.js:55`、`56`、`65`、`84`、`142` | `solveKinematics` | 主角、虛影、軌跡、相位標記 | 3.4（`lib/player/`） |
| 11 | `js/renderer.js:45`、`618`；`js/ui.js:192`、`271`、`294` | `getActiveRunnerTiming` | 計時、相位跳轉、HUD | 3.5（D4） |
| 12 | `js/renderer.js:209`、`565` | `computeGctMetrics` | 觸地／騰空 HUD、波形 | 3.7（讀 `metrics.gct`，D5） |
| 13 | `index.html:1357` | `computeStrideForCameraMode` | `recalculateStrideForCameraMode`（機位、身高、重設、`switchProfile` `js/ui.js:187`、擷取完成 `js/analyzer.js:172`） | 3.7（D6 derive） |
| 14 | `index.html:1386` | `parseManualStrideValue` | 手動步幅輸入解析 | 3.4（移到 UI／`lib/player/` 旁的輸入模組） |
| 15 | `index.html:1513`、`1556` | `computeGctMetrics` | GCT 色條、遙測 | 3.7（D5） |
| 16 | `index.html:1554` | `computePersonalizedPhaseTiming` | 遙測時改寫 `s.phaseTiming` | 3.7（D5） |
| 17 | `index.html:1576` | `computeAutoStrideMeters` | 遙測的自動步幅 | 3.7（D5／D6） |
| 18 | `index.html:1628` | `calculateOverallRunningScore` | 總分 | 3.7（D5） |
| 19 | `index.html:2063–2064` | `evaluateProfileCycle`、`solveKinematics` | `renderSimVideo` 徐國峰預覽（繞過關鍵幀） | 3.5（D9）＋3.4 |
| 20 | `index.html:1329–1332` | （載入四支 temp-core） | — | 3.7 移除 |

- `RUNNER_PROFILES` 定義在 `js/config.js:43`（UI 檔，不屬於 temp-core），讀寫點見決策文件第 3 章 (5)。
- 第 3 列以外，3.3 只動到第 5 列。第 13 列在擷取完成時仍會呼叫：先以舊 profile 的步頻呼叫 `recalculateStrideForCameraMode(newSummary)`（`js/analyzer.js:172`），之後 `switchProfile`（`js/ui.js:184–188`）在 `!isManualStride` 時用 `custom_captured` 的步頻再算一次，**最終步幅與 Server 端 `analyzeCapturedFrames` 內以偵測步頻算出的值相同**（機位未變時）。3.3 保留這個流程，在 Verification 第 5 步確認。
- `lib/` 端：`lib/server/analyze.js:17` `analyzeRequest` 已提供完整結果。`metrics` 目前只有 `gctMs`、`flightMs`、`isWalking`、`overallScore`（`:85–90`），不足以取代第 12、15–18 列，所以必須等契約 1.1.0（第 4 節）。

## 3. Next.js 16.4.6 查證

3.3 不新增路由、不改 `next.config.mjs` 的行為，也不用新的 Next API。頁面仍是 `public/` 靜態 HTML（3.2 規格「文件查證」已確認：不經 bundler、不套用 `/api/:path*` 標頭）。同源 `fetch` 由瀏覽器自動帶 `Sec-Fetch-Site: same-origin`，符合 `lib/server/access-control.js` 規則 1。start 時仍須依 AGENTS 讀 `node_modules/next/dist/docs/` 中與 `public` 及 Route Handler 相關的頁面，確認沒有新的 deprecation。

## 4. 是否拆分：**建議拆成 5 個 Feature**

### 4.1 為什麼路線圖原本的 3.3 必須拆

原 3.3 包含 D1–D9 全部內容，外加移除 temp-core。拆分時有一個**相依順序的限制**：只要 temp-core 還沒有替代品，就不能移除。第 2 節的第 6、12–18 列（遙測、GCT、總分、步幅、匯入正規化）在**每一個 profile、每一個動畫影格**都會呼叫核心。拿掉 temp-core 之前，這些值必須已經由 Server 提供：內建 profile 用烘焙資料，擷取結果用契約 1.1.0，匯入與手動調整用 `/api/derive`。

因此「3.3＝`/api/analyze`＋`lib/player`＋`lib/profiles`＋移除 temp-core，derive 與 1.1.0 另列」的切法**不可行**。移除 temp-core 後，JSON 匯入、手動步頻、身高、機位、遙測、總分都會壞掉。可行的切法是把「移除 temp-core」放在**最後**。

### 4.2 建議切分（依相依順序）

| 新編號 | 名稱 | 內容 | 決策 | 完成後的狀態 |
| ------ | ---- | ---- | ---- | ------------ |
| **3.3** | Client 呼叫 `/api/analyze`（本規格） | 影片擷取改上傳 landmarks 並套用 API 結果；錯誤 UX；刪除 `customCycleFrames`；`lib/` 不動 | — | temp-core 仍在，不可部署 |
| 3.4 | 瀏覽器共用模組與橋接（`refactor-`） | `lib/player/`（`solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes`、常數、只看關鍵幀的取樣入口）、`lib/landmarks/`（`extractAnglesFromLandmarks`、`evaluateCaptureFrame`）。`lib/core/` 改為 import 或轉匯出（`core-modules.test.js` 的 9 個名稱不變，baseline 逐值一致）。決定並實作 public 頁面的**橋接機制**（3.2 未決事項 1；建議見第 4.3 節）；UI 第 1、2、7、10、14 列改用橋接 | D1、D8 | 同上 |
| 3.5 | 內建 profile 烘焙與模擬擷取 | `lib/profiles/`（三個內建 profile 的靜態資料、101 幀 `cycleKeyframes`、衍生值）＋烘焙腳本＋「烘焙 == 核心重算」測試；合成 landmarks 樣本（無影片模擬擷取改送 API，須通過閘門且不被誤判為行走）；移除退回路徑、`evaluateProfileCycle`、`getActiveRunnerTiming` 唯讀化、`renderSimVideo` 改用關鍵幀；消除 `pullPct` 漂移 | D2、D3、D4、D9 | 同上 |
| 3.6 | 衍生值 API（契約 1.1.0＋`POST /api/derive`） | **只動 Server**：`metrics.gct` 完整物件、`schemaVersion` 升 `1.1.0`、契約 1.4／2.1／2.4／2.5 第 4 點的措辭修正；新端點沿用 `checkAccess`、驗證、標頭與 Vitest；`server-api.md`、`privacy.md` 第 3 節加上欄位表 | D5、D6（Server 端） | 同上 |
| 3.7 | Client 改讀衍生值並移除 temp-core | UI 第 6、12、13、15–18 列改讀 `metrics`／derive；手動步頻 debounce；JSON 匯入經 derive，不送 `profileName` 與檔名；**刪除 `public/legacy/temp-core/` 與 `index.html:1329–1332`、拿掉 `next.config.mjs` 部署防線**、改寫 `tests/legacy-client.test.js`；bundle 檢查（第 4.4 節）；隱私、README、AGENTS 改寫過渡期敘述 | D5–D7（Client 端）、D0 結束 | **可部署（進 4.1）** |
| 3.8 | 報告匯出（原 3.4） | 不變；只讀衍生結果 | — | — |

**理由**：每一步都可以單獨驗證、單獨 commit。3.4 與 3.6 是純 refactor 或純 Server 變更，能用 Vitest 逐值把關。3.3、3.5、3.7 各自只動一類 UI 路徑，Playwright 失敗時容易定位。如果想少一個 Feature，可以合併 3.6＋3.7（代價：同一個 Feature 同時改 Server 契約與 UI），或合併 3.4＋3.5（代價：refactor 與行為變更混在一起，baseline 驗證失去意義）。

**路線圖的修改**（start 前由使用者確認，見第 13 節第 1 點）：

- Epic 3 表格改成上表；原 3.4 報告匯出改為 3.8。
- 4.1 前置條件「3.3 完成（`public/legacy/temp-core/` 已移除）」改為「**3.7** 完成」。
- 下列處所寫的「3.3 移除」改成「3.7 移除」：`AGENTS.md`「專案背景」過渡期、README 第 3、9 行、`docs/privacy.md` 第 2 節、`next.config.mjs` 註解（只改註解，`legacy-client.test.js` 只數非註解行）、`tests/legacy-client.test.js` 檔頭註解、決策文件第 1 章第 6 點與第 8 章。
- temp-core 四檔檔頭也寫著「3.3 移除」，但它們**不得修改**。保持原樣，在決策文件第 2 章註記「檔頭的 3.3 指移除 Feature，現為 3.7」。
- 「待處理」中預計隨 3.3 消除的缺陷：`pullPct` 漂移與 `renderSimVideo` 改為 3.5，`customCycleFrames` 維持 3.3。

### 4.3 給 3.4 的橋接建議（記錄用，3.3 不做）

public 的 classic script 不能 import `lib/` 的 ES module。建議做法：

- 新增 `scripts/sync-legacy-modules.mjs`，把 `lib/player/`、`lib/landmarks/`（3.5 起再加 `lib/profiles/`、`lib/contract/`、`lib/config.js`）原樣複製到 `public/legacy/modules/`，保留相對路徑。
- 複製檔**提交進 git**，並以測試斷言與來源逐位元組相同（單一來源是 `lib/`）。
- `index.html` 加一段 `<script type="module">`，把模組掛到 `window.RFA = { player, landmarks }`。用命名空間，避免與 temp-core 的全域 `function` 同名衝突。module script 在 DOM 解析完、`DOMContentLoaded` 之前執行，舊 UI 的啟動流程不受影響（3.4 須實測）。
- 替代方案：Client Component 頁面（3.2 方案 B，改動大），或 esbuild 打包（新增依賴，須同意）。

### 4.4 給 3.7 的移除驗收（記錄用；若使用者不拆分，則直接併入本規格）

1. `public/legacy/temp-core/` 不存在；`index.html` 不含 `temp-core`；`next.config.mjs` 不含 `VERCEL`、`existsSync`、`temp-core`；`$env:VERCEL="1"; npm run build` 成功（之後移除變數）。
2. `tests/legacy-client.test.js` 的部署防線測試改為「temp-core 不存在、config 無防線」；`redirects()` 斷言保留。
3. `npm run build` 後，`.next/static/` 與 `public/` 對下列核心特有字串**零命中**：`嚴重跨步煞車或身後推蹬`（`lib/core/biomechanics.js:142`）、`🚶 行走步態 (雙腳交替支撐 • 零騰空)`（`:83`），另選 `cycle-analysis.js` 的評分字串 1 個與 `computePersonalizedPhaseTiming` 的常數字串 1 個。`lib/landmarks/`（D8）與 `lib/player/`（D1）的字串**不列入**。以 Vitest（掃 `public/`）＋一次性腳本（掃 `.next/static/`，結果寫入 Notes）驗證。
4. Playwright：network 沒有 `/legacy/temp-core/*` 請求；`window.computeGctMetrics`、`analyzeCapturedFrames`、`generatePoseMethodAlignedCycle` 皆為 `undefined`。
5. `docs/privacy.md` 第 1、2、4 節、README、`AGENTS.md`「專案背景」改為 D8 縮小後的如實敘述：「評分、GCT、相位計時、步幅、骨架模型只在 Server；角度擷取與閘門、關鍵幀取樣與正向運動學也在瀏覽器」。刪除 AGENTS 的過渡期條目。

## 5. 範圍（3.3）

```
public/legacy/
  js/analyzer.js        # 修改：記錄每幀 landmarks、上傳、套用結果、錯誤處理、刪 customCycleFrames
  js/state.js           # 修改：新增擷取上傳狀態（landmark 幀、序號、進行中旗標、起始方向）
  js/ui.js              # 修改：loadVideoFile 時遞增擷取序號（丟棄過時回應）；ended 分支不變
  index.html            # 原則上不改；若擷取按鈕須 disabled 樣式才改（同行替換）
tests/legacy-client.test.js   # 修改：「不呼叫 API」改為「只允許一處 fetch("/api/analyze")」等（第 8 節）
docs/privacy.md、docs/server-api.md、docs/client-server-boundary.md、docs/planning/epics-and-features.md
README.md、AGENTS.md、next.config.mjs（只改註解）
context/current-feature.md    # Notes
```

- **不修改**：`lib/`、`app/`、`public/legacy/temp-core/`、`package*.json`、`vitest.config.mjs`、其餘測試。
- **不新增依賴**。
- 3.2 以「行數不變」維持與決策文件行號的對應；3.3 起 `public/legacy/js/{analyzer,state,ui}.js` 的行號會改變。決策文件的行號本來就以舊專案 `e29766d` 為準，因此仍然有效；在決策文件第 2 章補一句「3.3 起 `public/legacy/` 行號與 `e29766d` 不再相同，查新位置請 grep 函式名」。

## 6. 設計決策

### 6.1 擷取上傳流程

1. `triggerCycleExtraction`（有影片的分支）：額外重設 `capturedLandmarkFrames = []`，遞增 `captureSeq`，記下 `captureStart = { runDirection, isManualDirection, heightCm }`（`heightCm` 取 `parseFloat(runnerHeightInput) || 172`，與 `js/analyzer.js:6` 相同）。
2. `onPoseResults`：當 `isCapturingCycle` 且影片模式時，在閘門判斷**之前**記錄 `{ t, lm: lm.map(p => [p.x, p.y, p.visibility ?? null]) }`。`lm` 是 `sanitizeLandmarks` 之後的值；`t` 與傳給 `extractAnglesFromLandmarks` 的 `videoTime` 必須是**同一次讀取**（`extractExactAnglesWithAspectCorrection` 改為接收 `videoTime` 參數）。觸發 `finalize` 的那一幀也要記錄（Server 會在同一幀 break）。**不做四捨五入**，否則結果會和本地不一致。不送 `z`。
3. 停止條件不變：閘門 `finalize`、收滿 55 幀、`ended` 且 ≥ 15 幀（`js/ui.js:30`）。另外新增上限 `MAX_UPLOAD_FRAMES = 1500`：landmark 幀數達到上限時視同 `finalize`。依據是每幀約 2 KB，1500 幀約 3 MB，低於 `LIMITS.maxBodyBytes` 4 MB 與 `maxFrames` 3000。Server 收到同一批幀，結果仍與本地一致。
4. `finalizeCycleExtraction`：前半段（停止擷取、還原播放速率、按鈕）不變；`< 8` 幀時照舊直接 return，不發請求。影片模式改為呼叫 `requestServerAnalysis(seq)`。
5. 請求本體只有 `frameWidth: videoCanvas.width`、`frameHeight: videoCanvas.height`、`heightCm`、`cameraMode: selectedCameraMode`、`runDirection`、`isManualDirection`（皆取自 `captureStart`）與 `frames`。**不送 `profileName`**：`custom_captured.name` 含影片檔名（`js/ui.js:142`），與 D7「不送檔名」一致。
6. `fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal })`。預設 `credentials: "same-origin"`、無自訂標頭；`AbortController` 逾時 30 秒。
7. 成功（200，且 `seq === captureSeq`）：以 `result.cadence`、`result.summary` 取代原本的 `detectedCadence`／`newSummary`，接著執行**原有**的套用流程：`recalculateStrideForCameraMode(summary)` → 指派 `custom_captured.cadence`／`summary` → 啟用選項 → `switchProfile("custom_captured")`。`result.cycleKeyframes` 經 `normalizeCycleKeyframes`（temp-core）驗證，合法才掛到 `custom_captured.cycleKeyframes`（待決定 2）。`result.metrics` 先忽略，遙測仍由 temp-core 以 summary 計算（與 Server 同一份程式，逐值相同）。
8. 再次擷取前要清掉 `custom_captured.cycleKeyframes`，避免新 summary 搭配舊關鍵幀。

### 6.2 狀態與競態

- 請求進行中：`isAnalyzingRemote = true`，擷取按鈕 `disabled`，文字顯示「☁️ 上傳分析中…」；`triggerCycleExtraction` 進入時若為 true 則 return。
- 過時回應：`loadVideoFile` 與 `triggerCycleExtraction` 都會遞增 `captureSeq`；回應的 seq 不符就直接丟棄，不提示、不改狀態。
- 失敗時不改 `RUNNER_PROFILES`、`activeProfileKey`、步幅狀態；按鈕恢復初始文字。

### 6.3 錯誤提示（`alert`，與舊 UI 匯入錯誤的作法一致；console 只用 `warn`）

| 回應 | 提示 |
| ---- | ---- |
| 422 `insufficient_frames` | 「有效步態影格不足（{acceptedFrames}/8），請調整起點或畫面後重試」 |
| 429 | 「請求過於頻繁，請 {Retry-After} 秒後再試」 |
| 400 | 「擷取資料不符格式（例如身高須介於 50–250 cm）」；`details` 只以 `console.warn` 輸出 |
| 413 | 「擷取資料過大，請縮短擷取區間」 |
| 403／415／500／其他 | 「分析服務暫時無法使用（{status}）」 |
| 網路錯誤 | 「無法連線到分析服務」 |
| 逾時 | 「分析逾時，請重試」 |

### 6.4 本 Feature 對 D1–D9 的處理

| 決策 | 3.3 |
| ---- | --- |
| D0 | 延續：temp-core 留到 3.7，部署防線不動 |
| D1、D8 | 不做（3.4）；即時 HUD、同步骨架、閘門仍用 temp-core |
| D2、D3、D4、D9 | 不做（3.5）；模擬擷取仍在本地 |
| D5 | 部分：`metrics` 忽略，遙測維持本地；契約 1.1.0 **不在 3.3**（3.6） |
| D6 | `POST /api/derive` **不在 3.3**（3.6／3.7） |
| D7 | 不變（匯入仍在本地） |
| D10、D11 | 不變／隱私見第 11 節 |

## 7. 實作步驟

1. `state.js` 新增 `capturedLandmarkFrames`、`captureSeq`、`captureStart`、`isAnalyzingRemote`、`MAX_UPLOAD_FRAMES`。
2. `analyzer.js`：`extractExactAnglesWithAspectCorrection` 接收 `videoTime`；`onPoseResults` 記錄 landmark 幀並檢查上限；`triggerCycleExtraction` 重設狀態、加上 `isAnalyzingRemote` 防護。
3. `analyzer.js`：拆出 `requestServerAnalysis(seq)`（fetch、逾時、狀態碼對應）與 `applyCapturedResult(cadence, summary, cycleKeyframes)`（原 `:171–187` 的套用流程，刪除 `:177–183`）。模擬分支（`:114–131`）改為呼叫 `applyCapturedResult`，仍用本地 `analyzeCapturedFrames`。
4. `ui.js` `loadVideoFile`：遞增 `captureSeq`，清除 `isAnalyzingRemote` 的 UI 狀態。
5. 修改 `tests/legacy-client.test.js`（第 8 節），跑 `npm test`。
6. 執行 build、lint、dev，依 Verification 驗證 HTTP 與 Playwright。
7. 更新文件（第 11 節），把 Notes 寫入 `context/current-feature.md`。

## 8. 測試計畫

**既有測試**：全部照舊通過，基準不變：`REQUIRE_BASELINE=1 npm test` → walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、landmarks 193／176／150。`privacy-docs.test.js` 不受影響（`app/`、`lib/` 未改）。`api-analyze-route.test.js` 已涵蓋同源請求、各狀態碼與樣本 200，不新增。

**`tests/legacy-client.test.js` 修改／新增**（維持粗糙的字串斷言風格）：

1. 把「不使用瀏覽器儲存、不呼叫 API」拆成兩項：
   - 儲存與其他通道（`localStorage`、`sessionStorage`、`indexedDB`、`document.cookie`、`XMLHttpRequest`、`sendBeacon`、`WebSocket`、`EventSource`）維持全面禁止。
   - `fetch(` 在 `public/legacy/**` 中只能出現**一次**，位於 `js/analyzer.js`，而且同一行或下一行必須是字面值 `"/api/analyze"`（只允許相對路徑，不得有 `http`）。
2. `js/analyzer.js` 的請求本體不含 `profileName`（以 `requestServerAnalysis` 函式的原始碼片段做字串檢查）。
3. `MAX_UPLOAD_FRAMES` 的值 ≤ `LIMITS.maxFrames`，且 `MAX_UPLOAD_FRAMES × 2800` < `LIMITS.maxBodyBytes`（每幀位元組的保守估計；從 `lib/server/validate-request.js` import `LIMITS`）。
4. `customCycleFrames` 不再出現在 `public/legacy/`。
5. temp-core 隔離、`TEMP-CORE` 檔頭、版本同步、部署防線等既有斷言不變。

**一次性對照（scratchpad，不提交）**：把三份 landmarks 樣本改成「Client 會送出的格式」（刪除 `profileName`），經 `handleAnalyzeHttp` 加同源標頭，確認回應與 `client-*.json` 一致，以證明「不送 `profileName`」不影響數值。

## 9. 驗收標準

1. 用 `woman03 - Trim.mp4` 擷取：恰好一個 `POST /api/analyze` → 200；UI 的 `custom_captured` 步頻、步幅、總分與 Server 回應一致，也與同一批幀的本地分析一致（Verification 第 5 步）。
2. 請求本體只含第 6.1 節第 5 點的 7 個欄位；`frames[].lm` 每幀 33 點 `[x, y, v]`；沒有 `profileName`、沒有 `z`。
3. 第 6.3 節每種錯誤都有提示，狀態不變，console 沒有 error。
4. 過時回應被丟棄；請求進行中無法重複擷取。
5. 無影片模擬擷取、切換 Profile、播放骨架、選擇／拖入影片、匯入 walk JSON（103／361ms／96）、匯出再匯入都和 3.2 相同。
6. `git diff --stat -- lib app public/legacy/temp-core` 為空；build、lint、`REQUIRE_BASELINE=1 npm test` 全過；`VERCEL=1` 仍會讓 build 失敗（防線還在）。
7. 文件依第 11 節更新，不宣稱尚未成立的保護（例如「核心只在 Server」）。

## 10. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`、`npm run lint`。
2. `REQUIRE_BASELINE=1 npm test`，記錄基準數值；另跑一次不帶變數的 `npm test`。
3. HTTP（`npm run dev`，用 `curl -i`）：`GET /` → 307；`/legacy/js/analyzer.js` → 200；同源樣本 `POST /api/analyze` → 200 且 5 個安全標頭不變；帶 `Sec-Fetch-Site: cross-site` → 403。
4. **Playwright：載入頁面**，console 沒有 error（Tailwind CDN warning 允許），沒有 404。
5. **Playwright：影片擷取**
   - 用 file input 選 `woman03 - Trim.mp4`，按下擷取，等到按鈕出現「✅」。
   - 攔截請求：method POST、`Content-Type: application/json`、`Sec-Fetch-Site: same-origin`；本體鍵集合、幀數 ≤ 1500、沒有 `profileName`；回應 200。
   - **一致性對照**（temp-core 仍在頁面上）：在 `page.evaluate` 對 `capturedRawFrames` 以同樣參數呼叫 `analyzeCapturedFrames`，經 `JSON.parse(JSON.stringify())` 後與回應的 `summary`、`cadence` 深度相等；`RUNNER_PROFILES.custom_captured.summary.strideMeters` 等於回應值（機位為 auto、未手動改步幅時）。不相等時把差異寫入 Notes 並停下來回報。
   - `custom_captured.cycleKeyframes.frames.length === 101`（若待決定 2 採預設）。
6. **Playwright：錯誤與競態**（`page.route` 注入）
   - 回應 422（`acceptedFrames: 5`）、429（`Retry-After: 7`）、400、500、`route.abort()`、延遲 31 秒（逾時）：各自提示正確（`page.on("dialog")`），`activeProfileKey` 與 `custom_captured.summary` 不變，按鈕恢復，console 沒有 error。
   - 延遲回應期間重新載入影片：回應被丟棄，profile 不變。
   - 請求進行中再按擷取：不會發出第二個請求。
7. **Playwright：互動回歸**（AGENTS 第 4 項）：切換 Profile（`hsu_pose_method` → `night_track_runner` → `custom_captured` → 匯入的 `json_*`）、播放／暫停骨架、相位跳轉、圖層切換、拖入影片（`#videoDropZone` drop）、匯入 walk JSON 顯示 103／361ms／96、匯出擷取結果再匯入數值不變（含 `cycleKeyframes`）、無影片時的模擬擷取與徐國峰預覽。
8. 文件核對（第 11 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/privacy.md` | 第 1、2 節：3.3 起**影片擷取完成時會上傳 landmarks**到 `/api/analyze`；無影片模擬擷取、匯入、手動調整仍在本地；temp-core 仍在瀏覽器，**仍不可部署**；「核心只在 Server」要到 3.7 才成立。第 3 節：註明 Client 不送 `profileName`，所以 API 回應不含檔名（匯出 JSON 的 `profileName` 由 Client 本地寫入，仍含影片檔名，與 3.2 相同）；`frames` 包含擷取期間的每一幀，最多 1500 幀。第 10 節：刪除「Client 開始上傳（3.3）」，保留 derive／移除 temp-core。第 11 節：更新 `legacy-client.test.js` 的檢查描述 |
| `docs/server-api.md` | 第 3 行「Client 尚未呼叫此 API」改為「3.3 起舊 Client 在影片擷取完成時呼叫（不送 `profileName`）」 |
| `README.md` | 目前狀態：3.3 完成，擷取改呼叫 API，temp-core 留到 3.7，仍不可部署；隱私摘要改為「3.3 起影片擷取上傳 landmarks」；第 3 行過渡期改為「3.2–3.7」 |
| `AGENTS.md` | 過渡期改為「3.2 完成至 3.7 完成」（待決定 1 確認後） |
| `docs/client-server-boundary.md` | 第 2 章：行號不再相同、temp-core 檔頭的 3.3 指 3.7；第 8 章：3.3 改為本規格的範圍，新增 3.4–3.7 對應的 D#；D 表「影響」欄的「3.3」改為新編號；第 9 章：`customCycleFrames` 已刪除 |
| `docs/planning/epics-and-features.md` | 依第 4.2 節修改 Epic 3 表格、4.1 前置條件、「待處理」 |
| `next.config.mjs`、`tests/legacy-client.test.js` | 只改註解中的 3.3 → 3.7 |

## 12. 風險與已知限制

- **一致性依賴「同一批輸入」**：Server 從 `captureStart.runDirection` 開始重跑方向與閘門。若使用者在擷取中途手動切換方向或修改身高，Client 的即時判斷與 Server 結果可能不同；這時以 Server 為準，記為已知限制。
- **`t` 的讀取時間點**：必須與 `extractAnglesFromLandmarks` 的 `videoTime` 是同一個值；兩次讀取 `currentTime` 可能不同，會讓步頻偏移。
- **上傳量**：一次 0.3–3 MB；手機網路可能慢，逾時 30 秒可能不夠，實測後調整。
- **限流**：擷取 1 次＝1 個請求，30 次／60 秒足夠；同一 NAT 共用額度時可能 429（已有提示）。
- **掛上關鍵幀後的行為變更**（待決定 2）：`custom_captured` 有了關鍵幀後，手動改步幅、身高、步頻**不再改變骨架**（契約 2.5 第 5 點），只改遙測。這與匯入 Server JSON 的現行行為相同；3.2 的擷取結果則會隨步幅變動。
- **過渡期混合來源**：擷取結果來自 Server，遙測、衍生值仍由 temp-core 計算。兩者是同一份程式（Epic 1 已驗證逐值相同），但 temp-core 是凍結副本，3.7 前不得修改 `lib/core/` 的行為。
- **仍不可部署**：3.3 完成不代表可以進 4.1，文件要寫清楚。
- **Playwright 依賴 CDN 與 MediaPipe**，即時擷取的幀數不固定，因此 Verification 第 5 步比的是「同一批幀的 Server 與本地結果」，不比固定的 193。
- **分析失敗時的提示**：舊程式 `< 8` 幀時只顯示「✅」卻沒有結果（既有缺陷）；3.3 對這個情況維持原樣不發請求，只有 Server 回 422 時才提示。

## 13. 待決定（start 時先採預設）

1. **切分**：採第 4.2 節的 5 個 Feature（3.3–3.7）並把報告匯出改為 3.8（**建議**）／合併 3.6＋3.7／不拆分（本規格擴大為原 3.3 全部範圍，第 4.4 節併入驗收）。
2. **擷取結果是否掛 `cycleKeyframes`**：掛（**建議**；骨架以 Server 結果為準，與匯入行為一致，3.5 之後本來就必須如此）／3.3 先不掛，維持 3.2 的骨架行為，到 3.5 再掛。
3. **錯誤提示方式**：`alert`（**建議**，與舊 UI 一致）／按鈕文字或狀態列。
4. **上傳上限** `MAX_UPLOAD_FRAMES = 1500`、逾時 30 秒（**建議**），或其他數值。

## 14. 未決事項（不阻擋開工，需要使用者回答）

1. 路線圖改編號（3.4–3.8）是否可行，還是要改用 3.3a／3.3b 之類的子編號以保留「3.4 報告匯出」？
2. 3.4 的橋接機制：同步複製到 `public/legacy/modules/` 並提交（建議）／Client Component 頁面／新增打包依賴。3.4 規格開工前決定即可。
3. 3.5 的合成 landmarks：需要從關節角度反推 33 點正規化座標（`solveKinematics` 只有部分關節），而且必須通過閘門、步頻正確、不被判為行走。可行性要在 3.5 規格裡先做原型確認；若不可行，D9 需要再請使用者決定（例如改為上傳一份真實錄製的去識別化樣本）。
