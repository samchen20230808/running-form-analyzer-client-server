# Feature 3.7 — Client 改讀衍生值並移除 temp-core

## Status

`done`（第 13 節採建議預設即可開工；第 14 節未決事項待使用者回答，第 14 節第 1、2 點建議在 start 前確認）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

落實 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) **D5、D6、D7 的 Client 端**，並結束 3.2 開始的過渡期：

1. **D5／D6**：舊 UI 的遙測、診斷卡、總分、GCT 色條、狀態牌、波形色帶、機位／身高／重設自動／手動步頻的重算，改讀 `POST /api/derive` 的回應（`metrics`〔含 `gct`〕、`stride`、`autoStrideMeters`）。瀏覽器不再呼叫任何核心公式。
2. **D7**：JSON 匯入改由 derive 正規化 `phaseTiming`（**只在匯入時採用**），檔案缺少或帶不合法 `cycleKeyframes` 時以 `includeKeyframes: true` 補骨架（3.5–3.6 期間這類檔案不顯示骨架）。
3. **移除暫時核心**：刪除 `public/legacy/temp-core/`（四檔）、`index.html` 的四個 `<script>`、`next.config.mjs` 的 `VERCEL` 部署防線，lint 忽略與過渡期測試一併改寫。完成後「評分、GCT、相位計時、步幅、骨架模型只在 Server」才成立，可進 4.1。
4. 附帶：手動步頻 `oninput` debounce、`public/js/config.js` 的 `analysisSchemaVersion` 升 `1.1.0`（匯出帶 `metrics`）、bundle 檢查、改寫過渡期文件。

**Server 零變更**：`lib/server/`、`lib/core/`、`lib/config.js`、`lib/contract/`、`app/` 不修改。`REQUIRE_BASELINE=1 npm test` 的基準照舊：walk 樣本 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150（總分 66／90／75）。

**UI 逐值一致**：在合法輸入下，改讀 derive 後畫面上的每個數值與文字，必須與改動前（temp-core 本地計算）相同（第 7.2 節的 Playwright 前後對照）。刻意的行為變更只限第 6.9 節所列。

## 1. 目標與非目標

### 目標

1. 新增瀏覽器共用模組 `lib/client/`（純函式，無 `fetch`）：組 derive 請求、匯入檔的 summary 補預設值與前置檢查；經 `sync:legacy` 同步到 `public/modules/client/`，以 `RFA.client` 橋接（第 6.1 節）。
2. 新增 `public/js/derive.js`（classic script）：`scheduleDerive`（debounce、序號丟棄過時回應、逐 profile 記憶）、`postDerive`（逾時、錯誤分類）、`applyDerivedResult`（第 6.2 節）。
3. 改寫 UI 呼叫點（第 2.1 節全部 9 處）：遙測改讀快取的 derive 結果，觸發點改呼叫 `scheduleDerive`（第 6.3、6.4 節）。
4. 匯入（D7）：前置檢查 → derive（必要時 `includeKeyframes`）→ 成功才建立 profile；失敗 `alert` 並中止、不改狀態（第 6.5 節）。
5. 擷取完成不再呼叫本地步幅重算，改由 derive 套用（第 6.6 節）。
6. 匯出：`schemaVersion` 1.1.0，帶 `metrics`（第 6.7 節）。
7. 移除 temp-core 與部署防線；改寫 `tests/legacy-client.test.js` 過渡期案例（第 6.8 節）。
8. 測試（第 8 節）、Playwright 前後對照（第 7.2 節）、bundle 檢查、文件同步（第 11 節）。

### 非目標

- 修改 `/api/derive`、`/api/analyze` 或任何 Server 模組（含限流數值與共用計數）；`metrics.indicatorScores`、`runDirection` 回傳。
- UI 內嵌判斷門檻（`index.html` `updateTelemetryAndDiagnostics` 內的 `isWalk`／`isTrunkGood` 等，D10）、`isWalking`／`isBiomechanicalRunner` 判斷式合併、評分公式修改。
- 內建 profile 烘焙衍生值（第 13 節第 7 點，預設不做）。
- 報告匯出（3.8）、React 化、手機版、行走模型 HUD 左右腳標示錯誤（另開 `fix-`）。
- Analyze 的 Client 端 `validateAnalysisJSON` 重複定義（`public/js/analyzer.js`）與 `lib/contract/` 合併。
- 部署、push、Vercel 設定（4.1，使用者操作）。
- `APP_CONFIG.version`（`V3.29`）不升版（非發版）。

## 2. 現況盤點

基準：本專案 `master` `adbb013`（3.6 完成），工作區乾淨。行號以 Grep／Read 取得，start 時重新確認。

### 2.1 UI 仍呼叫 temp-core 的位置（3.7 全部移除）

| # | 位置 | 呼叫 | 用到的輸出 | 3.7 改為 |
| - | ---- | ---- | ---------- | -------- |
| 1 | `public/index.html:1357` `recalculateStrideForCameraMode` | `computeStrideForCameraMode(s, selectedCameraMode, heightCm, curCadence)` | `pixelVal`、`strideMeters`、`measuredStrideMeters`、`strideModeText` | derive `stride`；寫回邏輯（`:1364–1381`）原樣保留為 `applyStrideResult(s, stride)` |
| 2 | `public/index.html:1513` `updatePhaseTimingUI` 備援 | `computeGctMetrics` | 9 個欄位 | 刪除備援：呼叫端一律傳入 `gct` |
| 3 | `public/index.html:1555` `updateTelemetryAndDiagnostics` | `computeGctMetrics(s, cadence)` | KPI、診斷卡（`:1773–1905`） | 快取的 `metrics.gct` |
| 4 | `public/index.html:1575` 同上，非手動步幅 | `computeAutoStrideMeters(s, heightCm, cadence)` | 遙測步幅（選擇規則 `measuredStrideMeters > 0 ? 它 : auto` 留 UI） | 快取的 `autoStrideMeters` |
| 5 | `public/index.html:1627` 同上 | `calculateOverallRunningScore(s, cadence)` | 總分 | 快取的 `metrics.overallScore` |
| 6 | `public/js/renderer.js:220` 狀態牌 | `computeGctMetrics` | `stancePct`、`gctMs`、`flightLabel`、`flightMs` | 快取的 `metrics.gct`；無快取時不畫狀態牌 |
| 7 | `public/js/renderer.js:590` 波形色帶 | `computeGctMetrics` | `stancePct` | 同上；無快取時不畫色帶 |
| 8 | `public/js/analyzer.js:347` `buildSafeSummaryFromJSON`（檔案帶 `phaseTiming`） | `computePersonalizedPhaseTiming({ phaseTiming }, cadenceVal)` | 正規化 `phaseTiming` | 匯入時 derive 的 `phaseTiming` |
| 9 | `public/js/analyzer.js:352` 同上（檔案無 `phaseTiming`） | `computePersonalizedPhaseTiming(safeSummary, cadenceVal)` | 同上 | 同上 |

- 其餘 temp-core 函式 UI 已不呼叫：`solveKinematics`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles`、`parseManualStrideValue`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame` 已於 3.4／3.5 改用 `RFA.*`；`evaluateProfileCycle`、`getActiveRunnerTiming`、`generatePoseMethodAlignedCycle`、`analyzeCapturedFrames` 已於 3.3／3.5 停用（`tests/legacy-client.test.js` F1、C3）。
- 移除前以 Playwright 確認 `index.html` 沒有其他對 temp-core 全域的隱性依賴（第 5 節步驟 1：刪 `<script>` 後跑一輪 P 組，console 不得出現 `ReferenceError`）。

### 2.2 會讓衍生值改變的觸發點

| 觸發 | 位置 | 現行動作 | 影響的輸入 |
| ---- | ---- | -------- | ---------- |
| 頁面載入 | `index.html:2090` `DOMContentLoaded` | `initRunnerProfiles` → `updateTelemetryAndDiagnostics` | 初始 profile（`isManualStride` 初值 `true`，`state.js:10`） |
| 切換 profile | `ui.js:193` `switchProfile`（`index.html:190` `onchange`） | 非手動時 `recalculateStrideForCameraMode` → 遙測 | profile |
| 機位 | `index.html:1337` `onCameraModeChange`（`:393` `onchange`） | 有 summary 時 recalc（**會把 `isManualStride` 設為 `false`**）→ 遙測、畫布 | `cameraMode` |
| 重設自動 | `index.html:1400` `resetStrideToAuto`（`:151`、`:308`） | `isManualStride = false` → recalc → 遙測 | — |
| 身高 | `index.html:1411` `onHeightInputChange`（`:128` **`onchange`**） | 非手動時 recalc → 遙測 | `heightCm` |
| 手動步頻 | `index.html:1423` `onManualCadenceInput`（`:267` **`oninput`**；只接受 100–240 整數） | 改 `profile.cadence` → 遙測 | `cadence` |
| 手動步幅 | `index.html:1385` `onManualStrideInput`（`:145`、`:302` `oninput`） | 改 `summary.strideMeters` → 遙測 | 只影響配速（本地四則運算，D6），**不需 derive** |
| 擷取完成 | `analyzer.js:206` `applyCapturedResult` | recalc（用**切換前** profile 的 cadence）→ `switchProfile("custom_captured")`（再 recalc 一次） | 新 profile |
| 匯入 | `analyzer.js:418` `importAnalysisJSON` | `buildSafeSummaryFromJSON` → 建 profile → 步幅模式還原 → `switchProfile` → 遙測 | 新 profile |

### 2.3 擷取完成時步幅的實際來源（3.6 第 13 節「applyCapturedResult 的步頻來源」的結論）

`applyCapturedResult` 先以切換前 profile 的 cadence 呼叫 `recalculateStrideForCameraMode`，但該函式**一律把 `isManualStride` 設為 `false`**（`index.html:1374`），所以緊接的 `switchProfile("custom_captured")` 必定再 recalc 一次，這次用的是作用中（＝剛擷取）的 cadence。第一次呼叫的輸出全部被第二次覆寫；它唯一的持久副作用「`_measuredPixelStride` 未設定時寫回」對 analyze 回傳的 summary 不會發生（analyze 一定帶數字 `_measuredPixelStride`）。

**結論**：最終步幅＝`computeStrideForCameraMode(summary, selectedCameraMode, 目前身高, 偵測步頻)`，3.7 只呼叫一次 derive（`applyStride`）即可逐值重現，並保留「擷取後 `isManualStride = false`」的副作用。

### 2.4 對設計有影響的既有特性

- **`phaseTiming` 不冪等**（3.6 §2.4）：`pullPct < 68` 時每正規化一次加 20。3.7 只在匯入時把 derive 的 `phaseTiming` 寫回 summary；其他呼叫一律忽略回應中的 `phaseTiming`。
- **`NaN` 與 `null`**：`buildSafeSummaryFromJSON` 用 `Number(...)`，壞檔會在 summary 留下 `NaN`。本地核心收到 `NaN` 時 `??` 不生效，算出 `NaN`（畫面顯示 `NaNms`）；經 JSON 後 Server 看到 `null`，走預設值。3.7 只影響請求內容（明確轉 `null`），summary 本身仍保留 `NaN`（UI 內嵌門檻照舊，D10）。
- **`/api/analyze` 不回 `strideModeText`**：擷取完成後仍需要一次 derive 才能取得步幅模式文字（第 6.6 節）。
- **derive 驗證比本地嚴格**：`cadence` 須 `0 < c ≤ 400`、summary 數值絕對值 ≤ 1000、`phaseTiming` 各值 0–100、summary 與 `phaseTiming` 未知鍵 400（`lib/server/validate-derive-request.js`）。本地核心對壞值照算不報錯。UI 現有的 summary 只含白名單鍵（內建 profile、analyze 回傳、`buildSafeSummaryFromJSON` 輸出皆已核對），但匯入檔的 `phaseTiming` 與 `cadence` 是外部輸入。
- **核心特有字串就是輸出**：3.3 §4.4 選的 marker `嚴重跨步煞車或身後推蹬`、`🚶 行走步態 (雙腳交替支撐 • 零騰空)` 是 `computeGctMetrics` 的 `advice`／`ratingText`。3.7 起它們只會出現在 derive 的執行期回應，不在任何靜態檔；日後若把衍生值烘焙進 `public/`，marker 清單須改選（第 12 節）。
- **同步渲染路徑**：`drawSimulator`（每個 animation frame）與 `drawWaveform` 同步讀 GCT；改讀 derive 後必須讀快取，不能在繪圖時發請求。
- **限流**：derive 與 analyze 共用每 IP 每 60 秒 30 次（3.6，使用者確認）。

### 2.5 移除 temp-core 牽動的檔案

| 位置 | 內容 | 3.7 |
| ---- | ---- | --- |
| `public/legacy/temp-core/{biomechanics,keyframes,landmark-extract,cycle-analysis}.js` | 暫時核心 | 刪除；`public/legacy/` 目錄隨之消失 |
| `public/index.html:1329–1332` | 四個 `<script src="legacy/temp-core/…">` | 刪除；同處加 `<script src="js/derive.js"></script>` |
| `next.config.mjs:1–7` | `existsSync` import 與 `VERCEL` 防線 | 刪除；`redirects()`、`headers()` 不動 |
| `eslint.config.mjs` | `"public/legacy/**"` 忽略 | 刪除該行與註解 |
| `tests/legacy-client.test.js` | 「temp-core 隔離與標示」、C1、「核心字串只在 temp-core」、E1、E2、「部署防線」 | 改寫（第 8 節 M 組） |
| `tests/privacy-docs.test.js:41` | 「`public/` 不含 `/api/derive`（3.7 移除此斷言）」 | 反轉（第 8 節 D 組） |
| `AGENTS.md:13` | 過渡期條目 | 刪除，「專案背景」改為如實敘述（第 14 節第 3 點） |

## 3. Next.js 16.4.6 查證

- 不新增 Route Handler、不改 `app/`。只改 `next.config.mjs`（刪除頂層的防線程式碼）；`redirects()`／`headers()` 的寫法不變。start 時依 AGENTS 重讀 `node_modules/next/dist/docs/01-app/03-api-reference/05-config/` 的 `redirects`、`headers` 兩頁，確認無新的 deprecation。
- `public/` 靜態檔的服務方式不變（`public/js/derive.js`、`public/modules/client/` 皆為一般靜態檔）。

## 4. 範圍

```
lib/client/                         # 新增：瀏覽器共用（純函式，無 fetch、無 DOM）
  index.js                          #   轉匯出
  derive-request.js                 #   DERIVE_SUMMARY_KEYS、PHASE_KEYS、DERIVE_INPUT_LIMITS、buildDeriveBody、deriveKey
  import-summary.js                 #   buildImportSummary（原 buildSafeSummaryFromJSON 去掉 phaseTiming 正規化）、checkImportInputs
public/
  modules/client/                   # 新增：sync:legacy 產生（提交進 git）
  modules/bridge.js                 # 修改：加 client
  js/derive.js                      # 新增：scheduleDerive／postDerive／applyDerivedResult／isDerivedCurrent
  js/analyzer.js                    # 修改：匯入、擷取完成、匯出
  js/renderer.js                    # 修改：兩處 GCT 改讀快取，null 時略過
  js/ui.js                          # 修改：switchProfile 改呼叫 scheduleDerive
  js/config.js                      # 修改：analysisSchemaVersion "1.0.0" → "1.1.0"（只改這一行）
  index.html                        # 修改：script 標籤；機位／身高／重設／步頻／步幅／遙測／DOMContentLoaded
  legacy/temp-core/                 # 刪除
next.config.mjs                     # 修改：刪除部署防線
eslint.config.mjs                   # 修改：刪除 public/legacy 忽略
scripts/sync-legacy-modules.mjs     # 修改：MANAGED 加 "client"（只改這一行）
tests/
  client-modules.test.js            # 新增：第 8 節 L、K 組
  legacy-client.test.js             # 修改：U、M 組；刪除過渡期案例
  browser-modules.test.js           # 修改：B 組（同步範圍含 client）
  privacy-docs.test.js              # 修改：D 組
docs/analysis-json-contract.md、docs/server-api.md、docs/privacy.md、docs/client-server-boundary.md、
docs/planning/epics-and-features.md、README.md、AGENTS.md
context/current-feature.md          # Notes
```

- **不修改**：`lib/server/`、`lib/core/`、`lib/config.js`、`lib/contract/`、`lib/player/`、`lib/landmarks/`、`lib/profiles/`、`app/`、`package.json`、`vitest.config.mjs`、`scripts/bake-profiles*.mjs`。
- **不新增依賴、不新增 npm script**。

## 5. 實作順序

1. **改動前快照**（temp-core 仍在）：
   - `REQUIRE_BASELINE=1 npm test`，記錄現況（281 通過）。
   - `npm run dev`，以 Playwright 跑第 7.2 節情境矩陣，擷取每個情境的 DOM 快照（`#overallScoreNum`、`#overallGradeBadge`、`#gctDetailText`、`#gctStatusText`、`#gctCompareBadge`、`#gctRangeBadge`、`#contactFlightBar` innerHTML、`#customStrideInput`、`#bannerStrideInput`、`#strideSourceBadge`、`#runnerPhaseDistBadges`、`#diagnosticCardsContainer` innerText、KPI 區 innerText），另以 `page.evaluate` 對作用中 profile 呼叫 temp-core 全域的 `computeGctMetrics` 等存下原始輸出，寫入 scratchpad（不進 git）。
   - 隱性依賴檢查：暫時刪掉四個 temp-core `<script>`，載入頁面看 console；只應出現第 2.1 節 9 處的 `ReferenceError`。還原。
2. 新增 `lib/client/`、`npm run sync:legacy`、`bridge.js` 加 `client`；`tests/client-modules.test.js`（L、K 組）、`browser-modules.test.js`（B 組）。跑測試。
3. 新增 `public/js/derive.js`，改 `index.html`（script 標籤與觸發點、遙測函式）、`renderer.js`、`ui.js`。此時 temp-core 仍載入，但 UI 已不呼叫；跑 P 組並與步驟 1 快照比對（**UI 逐值一致檢查點**）。
4. 改 `analyzer.js`（匯入、擷取、匯出）與 `config.js`；跑 P 組匯入／擷取／匯出情境並比對。
5. 刪除 temp-core、`<script>`、部署防線、lint 忽略；改寫 `legacy-client.test.js`、`privacy-docs.test.js`；跑 lint、build、`VERCEL=1` build、test。
6. bundle 檢查（第 10 節第 4 步）、完整 Verification、文件同步（第 11 節），Notes 寫入 `context/current-feature.md`。

## 6. 設計

### 6.1 `lib/client/`（瀏覽器共用，單一來源）

```js
// lib/client/derive-request.js（不 import lib/core、lib/server；同步腳本會擋）
export const DERIVE_SUMMARY_KEYS = [ /* 與 lib/server/validate-derive-request.js SUMMARY_KEYS 相同（L1 把關） */ ];
export const PHASE_KEYS = ["touchPct", "posePct", "fallPct", "pullPct"];
export const DERIVE_INPUT_LIMITS = { maxCadence: 400, maxSummaryAbs: 1000, heightCm: [50, 250] }; // 與 DERIVE_LIMITS 同值（L1）

// summary 白名單複製：非有限數字（NaN、±Infinity）→ null；undefined 維持缺；phaseTiming 只留 4 鍵，
// 各值非 0–100 有限數字 → null；phaseTiming 不是物件 → 不送。不改寫輸入。
export function buildDeriveBody(summary, { cadence, heightCm, cameraMode, includeKeyframes } = {}) { … }

// 記憶鍵：同一 body 必得同一回應（derive 無 timestamp，3.6 R5）
export function deriveKey(body) { return JSON.stringify(body); }
```

```js
// lib/client/import-summary.js
// 原 buildSafeSummaryFromJSON（analyzer.js:312–344）的預設值補齊，函式本體逐字搬移；
// 刪除 :346–356 的 phaseTiming 正規化，改為原樣帶入檔案的 phaseTiming（top-level 優先，與現行相同）。
export function buildImportSummary(data) { … }      // → summary（可能含 NaN，與現行相同）
// 前置檢查：cadence 非有限數字或不在 (0, 400]、summary 任一數值絕對值 > 1000 → 錯誤字串陣列
export function checkImportInputs(summary, cadence) { … }
```

- `DERIVE_SUMMARY_KEYS` 與上限數值在 Client 重複一份，以 L1 與 Server 常數比對（Server 零變更；替代方案見第 13 節第 1 點）。
- 經 `sync:legacy` 複製到 `public/modules/client/`，`bridge.js` 改為 `window.RFA = Object.freeze({ player, landmarks, profiles, client })`。
- `lib/client/` 不出現任何核心公式（只有欄位清單、上限、預設值與資料整形）。

### 6.2 `public/js/derive.js`

```js
const DERIVE_DEBOUNCE_MS = 400;   // 手動步頻 oninput
const DERIVE_TIMEOUT_MS = 10000;
let deriveSeq = 0;                // 每次送出遞增；回應的 seq 不是最新 → 丟棄
let deriveTimer = null;
let pendingApplyStride = false;   // debounce 期間合併（OR）
let deriveStatus = "idle";        // idle | pending | error（顯示用）

function scheduleDerive({ applyStride = false, delayMs = 0 } = {}) { … }   // 合併、計時、送出
async function postDerive(body) { … }     // → { ok:true, data } | { ok:false, status, message }
function applyDerivedResult(profileKey, result, { applyStride }) { … }
function getActiveDerived() { … }          // 作用中 profile 的快取結果或 null
function isDerivedCurrent(profile) { … }   // 快取回應的 cadence／heightCm／cameraMode 與目前輸入相同
```

流程：

1. `scheduleDerive` 讀作用中 profile，以 `RFA.client.buildDeriveBody(profile.summary, { cadence: profile.cadence || 180, heightCm: 身高輸入（parseFloat || 172，與現行相同）, cameraMode: selectedCameraMode })` 組 body（**不送 `includeKeyframes`、`profileName`、檔名**）。
2. 記憶：`profile.derived?.key === deriveKey(body)` → 直接同步套用（不發請求）。
3. 否則 `deriveSeq++`、中止上一個進行中的請求（`AbortController`）、`deriveStatus = "pending"`、呼叫 `updateTelemetryAndDiagnostics()`（顯示「更新中」）、`postDerive`。
4. 回應：`seq` 不是最新或 `activeProfileKey` 已改變 → 丟棄（不提示、不改狀態）。成功 → `profile.derived = { key, result }` → `applyDerivedResult`。失敗 → `deriveStatus = "error"`，保留上一份快取與畫面，顯示錯誤（第 6.4 節），`console.warn`（不用 `console.error`）。
5. `applyDerivedResult`：若 `applyStride` 且 `isManualStride === false` → `applyStrideResult(summary, result.stride)`（原 `recalculateStrideForCameraMode` 的寫回本體）；接著 `updateTelemetryAndDiagnostics()`、`drawWaveform()`，`simPlaying` 為 `false` 時 `drawSimulator()`。**不讀、不寫 `result.phaseTiming`**。

錯誤訊息（比照 3.3 analyze 的分類）：429 `請求過於頻繁，請 N 秒後再試`（`Retry-After`）、400 `數值超出範圍（例如身高須介於 50–250 cm）`（`console.warn` details）、逾時 `衍生值計算逾時`、網路 `無法連線到分析服務`、其他 `分析服務暫時無法使用（status）`。不自動重試；下一次使用者操作即重送。

### 6.3 觸發點與套用規則

| 觸發 | 3.7 動作 | `applyStride` | `delayMs` |
| ---- | -------- | ------------- | --------- |
| `DOMContentLoaded` | `initRunnerProfiles` → `scheduleDerive` | `false`（初值手動步幅） | 0 |
| `switchProfile` | 現行流程，recalc 改為 `scheduleDerive` | `!isManualStride` | 0 |
| `onCameraModeChange` | 有 summary 時：`isManualStride = false`（保留 recalc 的副作用）→ `scheduleDerive` | `true` | 0 |
| `resetStrideToAuto` | `isManualStride = false` → `scheduleDerive` | `true` | 0 |
| `onHeightInputChange` | `scheduleDerive`（手動步幅時也送，供 `autoStrideMeters` 與「目前」判斷） | `!isManualStride` | 0 |
| `onManualCadenceInput` | 合法值才改 `profile.cadence`（現行）→ `scheduleDerive` | `false`（現行不 recalc；見下註） | `DERIVE_DEBOUNCE_MS` |
| `onManualStrideInput` | 純本地（D6），不呼叫 derive；**取消進行中請求的步幅套用**（`pendingApplyStride = false`，metrics 照常套用） | — | — |
| `applyCapturedResult` | 刪除 recalc 呼叫，改 `isManualStride = false` → 建 profile → `switchProfile` | `true`（經 `switchProfile`） | 0 |
| `importAnalysisJSON` | 第 6.5 節 | 經 `switchProfile` | 0 |

- 註：手動步頻現行只呼叫遙測，非手動步幅時遙測以 `measuredStrideMeters > 0 ? 它 : computeAutoStrideMeters(…)` 寫 `s.strideMeters`，**不會**呼叫 `computeStrideForCameraMode`。3.7 維持此語意：步頻觸發的 derive 只用 `autoStrideMeters`（由遙測依現行規則寫回 `s.strideMeters`），不套用 `stride`、不改 `strideModeText`；以 P5 前後對照確認。
- 每個觸發後面原本緊接的 `updateTelemetryAndDiagnostics()`／`drawSimulator()`／`drawWaveform()` 保留（以快取或「更新中」狀態立即渲染），回應到達時 `applyDerivedResult` 再渲染一次。

### 6.4 渲染：快取、「更新中」與錯誤

- `updateTelemetryAndDiagnostics()` 維持**同步**、函式名與呼叫端不變；內部 `gct`、`totalScore`、auto 步幅改讀 `getActiveDerived()`。其餘（profile 名稱、相位、UI 門檻、診斷卡文案、配速）照舊。
- 作用中 profile **沒有快取**（首次載入、切到從未計算過的 profile）：不更新依賴衍生值的元素（保留 DOM 現狀），只更新不依賴的部分；不得對 `null` 取欄位丟錯。
- **有快取但 `isDerivedCurrent` 為 `false`**（debounce 中、請求中）：以快取渲染。
- 「更新中」與錯誤的顯示：`#diagSourceBadge` 文字後綴（`（更新中…）`／`（⚠️ 訊息）`），並對遙測區與 `#diagnosticCardsContainer` 加 `opacity-60`；**不新增版面元素**（第 13 節第 2 點）。成功回應後移除。
- `updatePhaseTimingUI(timing, gct)`：刪除 `gctMetrics || computeGctMetrics(…)` 備援；`gct` 為 `null` 時略過 GCT 區塊（相位區照常）。
- `renderer.js` 兩處：`const gct = getActiveDerived()?.metrics.gct ?? null`；`null` 時狀態牌與觸地／騰空色帶不畫（其他圖層照常）。不在繪圖路徑發請求。

### 6.5 匯入（D7）

```
1. JSON.parse、validateAnalysisJSON（現行，本地）
2. summary = RFA.client.buildImportSummary(data)；cadence = Number(data.cadence || 180)（現行）
3. errs = RFA.client.checkImportInputs(summary, cadence) → 有錯：alert("此 JSON 的數值超出可分析範圍") 並中止（console.warn errs）
4. ck = data.cycleKeyframes !== undefined ? RFA.player.normalizeCycleKeyframes(data.cycleKeyframes) : null
   needKf = !(ck && ck.ok)
5. body = buildDeriveBody(summary, { cadence, includeKeyframes: needKf })   // 不送 heightCm／cameraMode：此呼叫只取 phaseTiming 與關鍵幀，兩者不依賴它們
6. r = await postDerive(body) → 失敗：alert(訊息) 並中止（不建 profile、不改機位、不改身高、不改步幅狀態）
7. summary.phaseTiming = r.data.phaseTiming      // ★ 全專案唯一把 derive 的 phaseTiming 寫回 summary 的地方
8. 之後沿用現行流程：還原機位 → 建 profile → 掛關鍵幀（檔案合法者優先，否則 r.data.cycleKeyframes 經 normalizeCycleKeyframes）
   → 選項 → 身高 → 步幅模式還原 → switchProfile（觸發第二次 derive）→ 步幅輸入框 → 遙測
```

- 檔案的 `metrics` 一律忽略（契約 §2.4：Client 匯入時忽略 `metrics`，3.7 起改為「一律以 derive 重算」）。
- 機位還原從現行的第 1 步移到 derive 成功之後，才能做到「失敗不改狀態」。
- 請求不含 `profileName`、檔名、`profileKey`、`timestamp`；`buildDeriveBody` 的白名單保證（L2、U3）。
- 每次匯入用 2 次 derive（第 13 節第 6 點）。
- 關鍵幀來源：檔案未正規化的 `phaseTiming`＋檔案的 `strideMeters`，由核心內部正規化一次。與 3.5 之前（已正規化的 summary 再進模型，等於正規化兩次）只在原始 `pullPct < 48` 時不同；與「步幅模式還原後的 `strideMeters`」不同時，以檔案值為準。皆記錄為刻意差異（第 6.9 節）。
- walk 樣本（無關鍵幀）經此流程，關鍵幀應與 `kf-walk-101` 逐字相同（K1）。

### 6.6 擷取完成

`applyCapturedResult(cadence, summary, cycleKeyframes)`：刪除第一行 `recalculateStrideForCameraMode(summary)`，改為 `isManualStride = false`；其餘不變。`switchProfile("custom_captured")` 觸發 `scheduleDerive({ applyStride: true })`，結果依第 2.3 節與現行最終狀態逐值相同。每次擷取＝1 次 analyze＋1 次 derive。analyze 回應的 `metrics` 不另外使用（與 derive 的 `metrics` 同一個 `buildMetrics`，3.6 K4 已證明相同）。

### 6.7 匯出與契約 1.1.0

- `public/js/config.js` `analysisSchemaVersion: "1.1.0"`，與 `lib/config.js` 相同（U6）。
- `exportAnalysisJSON`：`isDerivedCurrent(profile)` 時在 `summary` 之後加 `metrics: profile.derived.result.metrics`；否則不帶（`metrics` 為選填，1.1.0 檔仍合法）。其餘欄位不變（`profileName` 照舊由 Client 寫入匯出檔，不上傳）。
- 匯出檔以 `lib/contract/validateAnalysisJSON` 驗證為 `ok`、零 warnings（P10）。

### 6.8 移除 temp-core 與部署防線

- 刪除 `public/legacy/temp-core/` 四檔；`git status` 顯示 4 個刪除，`public/legacy/` 不存在。
- `index.html`：刪除 `:1329–1332`；`js/derive.js` 放在 `js/pose.js` 之後、`js/analyzer.js` 那一行之前（`analyzer.js` 與 `bridge.js` 同一行的 C2 約定不變）。
- `next.config.mjs`：刪除 `existsSync` import 與 `:3–7` 防線及註解，其餘逐字不變。
- `eslint.config.mjs`：刪除 `"public/legacy/**"` 與其註解。
- `$env:VERCEL="1"; npm run build` 成功後 `Remove-Item Env:VERCEL`（Notes 記錄）。

### 6.9 預期的行為變更（全部刻意，驗收時逐條確認）

1. 遙測、總分、GCT、狀態牌、波形色帶在 derive 回應後才更新；首次載入與切到未計算過的 profile 會短暫呈現「更新中」（第 6.4 節）。
2. 手動步頻停止輸入 400 ms 後才更新衍生值（debounce）。
3. derive 失敗（429、網路、逾時）時保留上一份數值並顯示錯誤；過去本地計算不會失敗。
4. 匯入需要連線；失敗 `alert` 並中止。`cadence` 不在 (0, 400] 或 summary 數值絕對值 > 1000 的檔案改為拒絕匯入（過去會匯入並顯示 `NaN` 或極端值）。
5. 舊格式／無關鍵幀／不合法關鍵幀的匯入檔**重新顯示骨架**（3.5–3.6 期間不顯示）。
6. 匯入檔 `phaseTiming` 存在但 `posePct` 非數字：改以整份 summary 推算（過去只用 `{ phaseTiming }`＋預設值）；`phaseTiming` 各值超出 0–100 或非數字 → 視為 `null`。
7. 匯入檔 summary 含非數字欄位：derive 收到 `null` 走預設值，GCT／總分顯示數字而非 `NaN`（summary 本身仍保留 `NaN`，UI 門檻判斷照舊）。
8. 匯出檔 `schemaVersion` 為 `1.1.0` 並帶 `metrics`。
9. 匯入、手動調整、頁面載入都會呼叫 `/api/derive`，消耗與 analyze 共用的限流額度。

## 7. 逐值一致

### 7.1 Server 與核心

- `git diff --stat -- lib/server lib/core lib/config.js lib/contract lib/player lib/landmarks lib/profiles app package.json` 為空。
- `REQUIRE_BASELINE=1 npm test` 基準數值不變；3.6 的 R／K／H 組照舊通過。

### 7.2 UI 前後對照（Playwright，第 5 節步驟 1 的快照 vs 改動後）

| # | 情境 | 期望 |
| - | ---- | ---- |
| P1 | 載入 `/index.html`（徐國峰 profile，手動步幅 0.95） | 快照全部元素相同；網路恰好 1 個 `POST /api/derive` |
| P2 | 切換 `night_track_runner`、`custom_captured`，再切回 | 相同；切回已計算過的 profile 不發請求（記憶） |
| P3 | 每個內建 profile：重設自動 → 機位 static／tracking／auto | 步幅、`#strideSourceBadge`、配速、遙測相同 |
| P4 | 非手動步幅下身高 160、190 | 相同 |
| P5 | 手動步頻輸入 `2`→`20`→`200`（連續）、再輸入 `150` | 最終畫面與快照相同；每次連續輸入只發 1 個 derive |
| P6 | 手動步幅 `1.10` | 相同；不發 derive |
| P7 | 匯入 walk 樣本、`kf-walk-101`、`kf-hsu-101`、三份 `client-*.json` | 遙測／診斷相同（walk 103／361ms／96；client 66／90／75）；walk 樣本與 client 檔**現在有骨架**（第 6.9 節第 5 點），walk 樣本關鍵幀等於 `kf-walk-101`；`kf-*` 檔的 derive 請求不含 `includeKeyframes` |
| P8 | 無影片模擬擷取 | 步頻 166 等與快照相同；1 個 analyze＋1 個 derive |
| P9 | 選擇 `woman03 - Trim.mp4` 擷取（並以拖入再做一次） | 193 等與快照相同 |
| P10 | 匯出 → 再匯入同一檔 | 匯出檔 `schemaVersion` 1.1.0、帶 `metrics`、`validateAnalysisJSON` ok；再匯入後數值相同 |

快照比對以 `innerText`／`innerHTML` 字串全等；不同之處必須屬於第 6.9 節，逐條寫入 Notes。

## 8. 測試計畫

**既有測試**：除第 2.5 節列出的過渡期案例改寫外全部照舊通過；`tests/derive.test.js`、`api-derive-route.test.js`、`baseline.test.js` 不修改。

**L. `lib/client/` 單元（`tests/client-modules.test.js`，永遠執行）**

1. L1 常數一致：`DERIVE_SUMMARY_KEYS` 與 `SUMMARY_KEYS`、`PHASE_KEYS` 與 Server 的 `PHASE_KEYS` 完全相同（含順序）；`DERIVE_INPUT_LIMITS` 與 `DERIVE_LIMITS` 的 `maxCadence`、`maxSummaryAbs`、`heightCm` 相同；`buildDeriveBody` 輸出的頂層鍵 ⊆ `TOP_KEYS`。
2. L2 `buildDeriveBody`：未知 summary 鍵被丟棄；`NaN`／`Infinity`／`-Infinity` → `null`；`undefined` 不出現；`phaseTiming` 只留 4 鍵、101／`"15"`／`NaN` → `null`、非物件不送；不改寫輸入（`structuredClone` 比對）；輸出不含 `profileName`、`name`、`frames`、`profileKey`。
3. L3 合法性：三個內建 profile、含 `NaN` 的合成 summary、`buildImportSummary({ summary: {} })` 的輸出，經 `buildDeriveBody` 後 `validateDeriveRequest` 皆 `ok`。
4. L4 與本地核心相同：L3 中不含 `NaN` 的輸入，`deriveRequest(buildDeriveBody(s, opts))` 的 `metrics.gct`、`metrics.overallScore`、`stride`、`autoStrideMeters` 等於直接以 `lib/core` 對 `s` 呼叫 `computeGctMetrics`／`calculateOverallRunningScore`／`computeStrideForCameraMode`／`computeAutoStrideMeters` 的結果（＝改動前 temp-core 的本地值）；三種機位 × 身高 160／172／190 × 步頻 120／150／184。
5. L5 `NaN` 差異（記錄用）：`{ comOffsetCm: NaN }` 時，本地核心的 `gctMs` 為 `NaN`，derive 的結果等於以 `null` 呼叫核心的值；兩者不同（明確斷言差異存在）。
6. L6 `buildImportSummary`：walk 樣本與 `client-woman03` 形狀的合成資料，輸出等於凍結的期望物件（＝現行 `buildSafeSummaryFromJSON` 去掉 `phaseTiming` 正規化）；`data.summary = {}` 時套用現行預設值（7.4、3.0、155、74、14.5、84、2、38、0.95）；`phaseTiming` top-level 優先。
7. L7 `checkImportInputs`：`cadence` 0／-1／401／`NaN` → 錯誤；summary 1001／-1001 → 錯誤；合法輸入 → 空陣列。
8. L8 `deriveKey`：同一 body 相同；`cadence`／`heightCm`／`cameraMode`／任一 summary 值改變 → 不同。

**K. 基準逐值對照（`tests/client-modules.test.js`，`skipIf` 規則同 `baseline.test.js`）**

1. K1 walk 樣本模擬匯入：`buildImportSummary` → `buildDeriveBody(…, { includeKeyframes: true })` → `deriveRequest`：`JSON.stringify(cycleKeyframes)` 與 `kf-walk-101.json` 的 `cycleKeyframes` 逐字相同；`phaseTiming` `{0, 15, 30, 84}`；`metrics` 361／0／96。
2. K2 `kf-hsu-101` 去掉 `cycleKeyframes` 後同 K1，與檔內關鍵幀逐字相同。
3. K3 三份 `client-*.json` 模擬匯入：`metrics` 三個數值等於樣本；`phaseTiming` 等於 `lib/core.computePersonalizedPhaseTiming({ phaseTiming: 檔案值 }, cadence)`（＝現行本地路徑）。
4. K4 冪等防護：`pullPct` 40 的合成檔模擬匯入 → `phaseTiming.pullPct` 60；之後以寫回後的 summary 再組 body 呼叫 derive 兩次，**Client 端** summary 的 `phaseTiming` 仍為 60（以 `applyDerivedResult` 不碰 `phaseTiming` 的靜態檢查 U4 配合）。

**U. UI 靜態檢查（`tests/legacy-client.test.js`）**

1. U1 `public/js/*.js`、`index.html` 不以裸呼叫形式出現核心函式：`computeGctMetrics`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`calculateOverallRunningScore`、`computePersonalizedPhaseTiming`、`generatePoseMethodAlignedCycle`、`buildCycleKeyframesFromSummary`、`analyzeCapturedFrames`、`detectCadenceFromFrames`、`computeCycleSummaryStats`、`computeMeasuredPixelStride`、`evaluateProfileCycle`、`getActiveRunnerTiming`（併入並取代 F1）。
2. U2 `fetch(` 恰好兩處：`public/js/analyzer.js` 的 `"/api/analyze"`、`public/js/derive.js` 的 `"/api/derive"`，皆為相對路徑、不含 `http`（取代原「fetch 只有一處」）。
3. U3 `derive.js` 以 `RFA.client.buildDeriveBody` 組 body；`derive.js` 不含 `profileName`、`frames`；`analyzer.js` 匯入段落組 body 也只經 `buildDeriveBody`。
4. U4 `phaseTiming` 寫回只有一處：`derive.js` 不含 `phaseTiming`；全 `public/js`、`index.html` 中「把 derive 回應的 `phaseTiming` 指派給 summary」只出現在 `importAnalysisJSON`；`state.js` `getActiveProfileTiming` 仍唯讀（F4 保留）。
5. U5 debounce：`DERIVE_DEBOUNCE_MS` ≥ 250；`onManualCadenceInput` 以 `DERIVE_DEBOUNCE_MS` 呼叫 `scheduleDerive`。
6. U6 `public/js/config.js` 的 `analysisSchemaVersion` 等於 `lib/config.js` 的值（`"1.1.0"`）。
7. U7 `exportAnalysisJSON` 含 `metrics` 且以 `isDerivedCurrent` 把關。
8. U8 `updatePhaseTimingUI` 不含 `computeGctMetrics`；`renderer.js` 的 GCT 讀取經 `getActiveDerived()` 且有 `null` 防護。
9. U9 `index.html` 載入 `js/derive.js` 恰好一次，位於 `js/analyzer.js` 那一行之前；C2（`bridge.js` 與 `analyzer.js` 同一行）保留。

**M. 移除與部署（`tests/legacy-client.test.js`，取代過渡期案例）**

1. M1 `public/legacy/` 不存在；`index.html` 不含 `temp-core`、`legacy/`。
2. M2 `next.config.mjs` 不含 `VERCEL`、`existsSync`、`temp-core`；`process.env.VERCEL = "1"` 時 import 成功；`redirects()` 仍為 `/` → `/index.html`（保留原斷言）。
3. M3 `eslint.config.mjs` 不含 `public/legacy`。
4. M4 `public/**`（含 `modules/`）對 marker **零命中**：`嚴重跨步煞車或身後推蹬`、`🚶 行走步態 (雙腳交替支撐 • 零騰空)`、`overstrideDelay`、`lazyPullDelay`、`computeCycleSummaryStats`、`detectCadenceFromFrames`、`generatePoseMethodAlignedCycle`、`computeGctMetrics`、`calculateOverallRunningScore`、`computePersonalizedPhaseTiming`（取代「核心字串只在 temp-core」與 C4）。
5. M5 刪除 C1（temp-core 對照已無對象；`lib/player`／`lib/landmarks` 與 `public/modules/` 的一致性由 `browser-modules.test.js` 把關）。
6. M6 E1 改為「`public/legacy` 不存在，頁面與資源在 `public/` 根目錄」；E2 刪除；E3 保留。

**B. 同步與橋接（`tests/browser-modules.test.js`）**

1. B1 `lib/client/` 每個檔與 `public/modules/client/` 逐位元組相同；不同步時提示 `npm run sync:legacy`（沿用既有機制）。
2. B2 `bridge.js` 掛 `client`；`lib/client/` 不 import `lib/core`、`lib/server`、`server-only`（`privacy-docs.test.js` 既有的 `lib/player`／`lib/profiles` 規則擴及 `lib/client`）。

**D. 文件與隱私（`tests/privacy-docs.test.js`）**

1. D1 刪除「`public/` 不含 `/api/derive`」；改為 `public/js/derive.js` 含 `"/api/derive"`。
2. D2 `privacy.md` 含「匯入」與 `/api/derive` 的上傳說明（字串：`匯入 JSON 時`、`summary`）；不含 `temp-core`、`過渡期（3.2 完成至 3.7 完成）`。
3. D3 README 不含 `不可部署`；`AGENTS.md` 不含 `temp-core`（第 14 節第 3 點若使用者不同意則刪除此項）。

## 9. 驗收標準

1. `REQUIRE_BASELINE=1 npm test` 全過：基準 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字、193／176／150（66／90／75）；L、K、U、M、B、D 組全過。
2. 第 7.1 節 `git diff --stat` 為空（Server 零變更）。
3. 第 7.2 節 P1–P10 與改動前快照一致；差異全部屬於第 6.9 節並寫入 Notes。
4. `public/legacy/` 不存在；`VERCEL=1 npm run build` 成功；`npm run build`、`npm run lint` 成功。
5. `.next/static/` 與 `public/` 對 M4 marker 零命中（Vitest＋scratchpad 腳本）。
6. Playwright：網路無 `/legacy/temp-core/*` 請求；`window.computeGctMetrics`、`window.analyzeCapturedFrames`、`window.generatePoseMethodAlignedCycle`、`window.computePersonalizedPhaseTiming` 皆為 `undefined`；console 0 error。
7. `npm run sync:legacy`、`npm run bake:profiles` 執行後 `git status` 無差異。
8. 文件依第 11 節更新；「核心只在 Server」的敘述如實（含 D1／D8 留在瀏覽器的範圍與評分 oracle 風險）。

## 10. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`、`npm run lint`；`$env:VERCEL="1"; npm run build`（成功）後 `Remove-Item Env:VERCEL`。
2. `REQUIRE_BASELINE=1 npm test`（記錄測試數與基準）；另跑一次不帶變數的 `npm test`。
3. HTTP（`npm run dev`，`curl -i`）：`/` 307 → `/index.html`；`/index.html`、`/js/derive.js`、`/modules/client/index.js` 200（JavaScript MIME）；`/legacy/temp-core/biomechanics.js` 404；`POST /api/derive`（同源、walk summary）200。
4. **bundle 檢查**（scratchpad 腳本）：`.next/static/` 與 `public/` 搜尋 M4 marker，零命中（與 3.5／3.6 Notes 對照：過去的命中只在 temp-core）。
5. **Playwright**：第 7.2 節 P1–P10；另做：
   - 以 `page.route` 讓 `/api/derive` 回 429（`Retry-After: 12`）→ 手動調整後顯示錯誤後綴、數值保留、無 `alert`、console 無 error；恢復後下一次操作成功。
   - 讓匯入時的 derive 斷線 → `alert`、`#profileSelect` 無新選項、機位與身高不變。
   - 匯入 `cadence: 500` 的檔 → `alert`、不發 derive。
   - 快速連續切換 profile（3 次 / 200 ms）→ 只套用最後一個 profile 的回應（過時回應丟棄）。
   - 切 Profile、播放骨架動畫、相位按鈕、圖層切換、選擇／拖入影片（AGENTS 第 4 點）。
   - 計數：完整走一輪 P1–P10 的 derive 請求數寫入 Notes（評估限流餘裕）。
6. 文件核對（第 11 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/analysis-json-contract.md` | §2.1 範例註解「Client 在 3.7 前仍忽略」改為「Client 匯出時帶入（來自 derive），匯入時忽略並重算」；§2.4 同步；§3 註明 Client 匯出 1.1.0；修訂紀錄新增 3.7 一條（無格式變更，Client 端開始產出 1.1.0） |
| `docs/server-api.md` | 開頭警語改寫（3.7 起 Client 呼叫 derive 的時機：載入、切換 profile、機位、身高、重設自動、手動步頻〔debounce 400 ms〕、擷取完成、匯入〔2 次〕）；`/api/derive` 章節補「`phaseTiming` 只在匯入時被 Client 採用」「每次匯入／擷取的呼叫數」 |
| `docs/privacy.md` | 第 1／2 節刪除過渡期段落，改為如實敘述：評分、GCT、相位計時、步幅、骨架模型只在 Server；角度擷取與閘門、關鍵幀取樣與正向運動學（D1／D8）與內建 profile 輸出在瀏覽器；第 3 節 derive：**匯入 JSON 時會上傳其中的 summary 數值與 cadence**（不含 `profileName`、檔名、`timestamp`），手動調整與頁面載入也會送出作用中 profile 的 summary；第 6 節限流：各操作消耗的次數；第 10 節更新 |
| `docs/client-server-boundary.md` | 頂端狀態：3.7 已落實 D5–D7 Client 端、temp-core 已移除；D5／D6／D7「影響」欄註記 3.7 已落實；第 2 章 temp-core 行號說明改為歷史紀錄；第 8 章補 3.7 一段（含第 6.9 節行為變更摘要） |
| `docs/planning/epics-and-features.md` | 3.7 改 `done`，一句結論＋連到本規格；4.1 說明刪除「實測 Vercel build 有 `VERCEL`」（防線已移除），前置條件標為已滿足；待處理「55／8 重複」更新（Client 的 `>= 55`／`< 8` 若仍在 `analyzer.js` 擷取閘門之外則照實記錄） |
| `README.md` | 第 3 行刪除過渡期例外；目前狀態改為 3.7 完成、可進 4.1（尚未部署）；匯入／手動調整改為呼叫 `/api/derive` |
| `AGENTS.md` | 刪除第 13 行過渡期條目；「專案背景」目標句補上 D1／D8 在瀏覽器的範圍（第 14 節第 3 點） |

## 12. 風險與已知限制

- **延遲與「更新中」**：每次調整都要一次往返（本地約數十 ms、Vercel `hnd1` 視網路而定）。debounce 與逐 profile 記憶可減少請求，但首次載入與未計算過的 profile 一定要等。
- **需要連線**：Server 不可用時，頁面能載入、能播放內建骨架，但遙測維持 HTML 預設值或上一份結果；匯入無法進行。
- **共用限流額度**：一輪典型操作（載入 1、切 profile 數次、匯入 2、擷取 2、調整數次）約 10–15 次；密集調整後可能讓下一次影片分析 429。3.7 的 P 組計數寫入 Notes，若常態接近上限，另開 Feature 評估分開額度（第 14 節第 4 點）。
- **非同步競態**：序號丟棄、`AbortController`、手動步幅取消步幅套用三者缺一都可能讓舊回應覆寫新狀態。以第 10 節第 5 步的快速切換與 429 情境實測；匯入流程獨立於 `deriveSeq`（同時匯入兩檔會建立兩個 profile，屬既有行為）。
- **匯入上傳 summary**：過去匯入完全在本機；3.7 起會送出 summary 數值（不含檔名）。須在 `privacy.md` 明確記載。
- **壞檔行為改變**：第 6.9 節第 4、6、7 點；只影響非本系統產生或手改的檔案。
- **legacy 關鍵幀與 3.5 之前不同**：原始 `pullPct < 48`（雙重正規化差異）與步幅來源（檔案值 vs 還原後值）兩種情況，骨架與 3.5 之前的 live 計算不完全相同；3.5–3.6 期間這些檔案不顯示骨架，沒有「目前行為」可比，記錄即可。
- **Client 重複的常數**：`DERIVE_SUMMARY_KEYS` 與上限只靠 L1 測試與 Server 保持一致；改 Server 驗證規則時必須同步 `lib/client/`。
- **marker 即輸出**：M4 的兩個中文 marker 是 GCT 評級文字；任何把衍生值（含文字）烘焙進 `public/` 的作法都會讓 M4 失敗，屆時須改選 marker。
- **評分 oracle**（3.6 第 13 節）：移除 temp-core 後公式不再公開，但 derive 可被任意 summary 反覆查詢，限流僅盡力而為；如實記載，不宣稱公式受保護。
- **刪除 C1**：`lib/player`、`lib/landmarks` 不再與舊核心逐字對照；它們從 3.4 起就是單一來源，對照的必要性已消失。

## 13. 待決定（start 時先採預設）

1. **Client 共用邏輯放哪裡**：新增 `lib/client/`（同步＋`RFA.client`，可用 Vitest 單元測試與 K 組基準對照，**建議**）／全部寫在 `public/js/derive.js`（不動同步腳本，但 body 組裝與匯入補值只能靠 Playwright 驗證）。另：`DERIVE_SUMMARY_KEYS` 由 Client 重複一份並以 L1 比對（**建議**，Server 零變更）／Server 改從 `lib/client/` import（單一來源，但動 Server）。
2. **「更新中」的呈現**：保留 DOM 現狀＋`#diagSourceBadge` 後綴＋`opacity-60`（**建議**，不新增版面元素）／依賴衍生值的欄位改顯示 `—`（更明確，但要逐一處理約 20 個元素）。
3. **debounce 時間**：400 ms（**建議**）／250 ms（較即時，請求較多）。只用於手動步頻；身高為 `onchange`，不需要。
4. **逐 profile 記憶**：保留最後一次的 `{ key, result }`（**建議**，切回已計算 profile 不發請求）／不記憶（每次觸發都發請求）。
5. **擷取完成的步幅**：擷取後再呼叫 1 次 derive（**建議**，與現行最終狀態逐值相同、取得 `strideModeText`）／直接用 analyze 的 `summary.strideMeters` 與 `metrics`，`strideModeText` 由 Client 依機位與步頻推（省 1 次請求，但要在 Client 重複 `cadence < 135` 與文案，且身高／機位在上傳期間變更時結果不同）。
6. **匯入的請求數**：2 次（**建議**，第一次取 `phaseTiming`／關鍵幀，第二次由 `switchProfile` 照一般流程）／1 次（以第一次回應預先填入記憶，需證明 `phaseTiming` 與 `strideMeters` 不影響 `metrics`／`stride`，邏輯較繞）。
7. **內建 profile 衍生值是否烘焙**：不烘焙，載入時呼叫 derive（**建議**）／`bake:profiles` 一併烘焙預設步頻下的 `metrics`（首屏免等待，但 `ratingText`／`advice` 會進 `public/modules/`，與 M4 marker 衝突，須改選 marker）。
8. **錯誤提示**：手動調整用 badge 後綴＋`console.warn`、匯入用 `alert`（**建議**，與 D7「失敗 alert 並中止」一致）／一律 `alert`（手動調整時太干擾）。
9. **renderer 無快取時**：不畫狀態牌與觸地／騰空色帶（**建議**）／用預設 `stancePct` 35 照畫（現行 `|| 35` 的退回值，但會畫出與該 profile 無關的區間）。
10. **匯出是否帶 `metrics`**：`isDerivedCurrent` 時帶（**建議**，配合升 1.1.0）／不帶（則 `public/js/config.js` 升 1.1.0 的理由較弱）。

## 14. 未決事項（不阻擋開工，需要使用者回答）

1. **首次載入要等 Server 回應才顯示遙測，可以接受嗎？**
   - **建議預設：接受**（第 13 節第 7 點不烘焙）。本地 dev 幾乎無感；部署後首屏約一次往返。
   - 替代：內建 profile 的衍生值烘焙進 `lib/profiles/`（首屏即時、離線可看內建 profile），代價是評級文字進入公開檔、M4 marker 須改選，且步頻／身高改變後仍要呼叫 derive。
2. **壞檔改為拒絕匯入（第 6.9 節第 4 點）可以接受嗎？**
   - **建議預設：拒絕並 `alert`**（`cadence` 不在 (0, 400] 或 summary 數值絕對值 > 1000）。這些檔案過去會顯示 `NaN` 或極端值，Server 驗證本來就不接受。
   - 替代：Client 先 clamp（`cadence` 夾到 60–240、超界數值改 `null`）再送，可匯入但數值與檔案不同。
3. **`AGENTS.md` 的過渡期條目由 agent 在 3.7 一併刪除與改寫？**
   - **建議預設：是**（3.3 §4.4 第 5 點已預告；只刪第 13 行並改「專案背景」目標句，不動其他規則）。
   - 替代：agent 只在 Notes 提出建議文字，由使用者自行修改。
4. **共用限流額度在 3.7 之後是否維持？**
   - **建議預設：維持**（3.6 已確認）。3.7 只記錄 P 組的實際請求數；若評估後常接近 30 次／60 秒，另開 Feature 把 derive 改用獨立計數（會動 `access-control.js` 與 privacy 文件）。
