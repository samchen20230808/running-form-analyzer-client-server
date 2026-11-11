# Feature 1.2 — analyze 主流程與契約 v1.0.0

## Status

`done`

## Epic

Epic 1 — 核心演算法 ESM 化（server-only）

## Objective

把舊專案 `server/lib/analyze.js`（`analyzeRequest`）與 `server/lib/validate-request.js`（`LIMITS`、`validateRequest`）搬成本專案的 server-only ES module，改成直接 import `lib/core/index.js`，不再經過 `load-core.js`／`node:vm`。同時把舊 Client 的純函式 `validateAnalysisJSON`（`js/analyzer.js`）搬進來，用來驗證回應符合契約 v1.0.0。

**計算行為零變更**：`analyzeRequest` 的成功回應與舊 Server 逐欄位相同（`timestamp` 除外）。用 Vitest 與 baseline 逐值比對證明。完成後 `tests/baseline.test.js` 改用正式的 `analyzeRequest`，刪除測試專用的 `tests/helpers/landmarks-pipeline.js`。

1.2 **不做 HTTP**：不新增 Route Handler、不回傳 HTTP 狀態碼、不讀 body、不處理 Content-Type。這些屬於 1.3。`analyzeRequest` 只回傳「成功結果或錯誤類型」，由 1.3 對應成狀態碼。

## 舊專案現況（唯讀盤點結果）

| 舊檔 | 內容 | 依賴 | 備註 |
| ---- | ---- | ---- | ---- |
| `server/lib/analyze.js` | `analyzeRequest(body)` → `{ status, body }`；模組內 `plain()` | `loadCore()`（vm）、`validateRequest`、`LIMITS` | 驗證 → 擷取迴圈 → `analyzeCapturedFrames` → 組契約物件 |
| `server/lib/validate-request.js` | `LIMITS`、`validateRequest(body)` → `{ ok, details, tooLarge? }` | 無 | 只檢查型別、範圍、筆數，不修正資料 |
| `js/analyzer.js` 第 239–294 行 | `validateAnalysisJSON(data)` → `{ ok, legacy, schemaVersion, errors, warnings }` | 全域 `APP_CONFIG.analysisSchemaVersion` | 純函式，不碰 DOM；註解寫「可供 Server 共用」。舊 Server 其實沒有使用 |
| `server/lib/http-handler.js` | HTTP 流程；用 `LIMITS.maxBodyBytes` | `analyzeRequest`、`LIMITS` | 屬 1.3／Epic 2，1.2 不搬 |
| `server/scripts/verify.mjs` | summary／landmarks／錯誤處理／存取控制／部署打包檢查 | — | 「錯誤處理」9 個案例是 1.2 測試的來源 |

`LIMITS`（舊值，照搬）：

| 名稱 | 值 | 使用者 |
| ---- | -- | ------ |
| `maxFrames` | 3000 | `validateRequest`（超過時 `tooLarge`） |
| `maxBodyBytes` | 4 × 1024 × 1024 | 舊 `http-handler.js`（1.3 使用） |
| `minAcceptedFrames` | **8** | `analyzeRequest`：閘門收到的幀數少於 8 時回傳 `insufficient_frames` |
| `maxAcceptedFrames` | **55** | `analyzeRequest`：收滿 55 幀就停止擷取 |
| `landmarkCount` | 33 | `validateRequest` |
| `maxFrameSize` | 16384 | `frameWidth`／`frameHeight` 上限（px） |
| `heightCm` | [50, 250] | `validateRequest` |
| `maxTimeSec` | 86400 | `frames[i].t` 上限 |
| `coordRange` | [-5, 5] | `lm` 的 x、y |
| `maxProfileNameLength` | 200 | `profileName` |

舊 `analyzeRequest` 的錯誤與狀態碼：

| 情況 | 舊 status | 舊 body |
| ---- | --------- | ------- |
| `validateRequest` 失敗且 `tooLarge`（`frames.length > 3000`） | 413 | `{ error: "payload_too_large" }`（不帶 details） |
| `validateRequest` 其他失敗 | 400 | `{ error: "invalid_request", details }` |
| 閘門收到的幀 < 8 | 422 | `{ error: "insufficient_frames", acceptedFrames }` |
| 成功 | 200 | 契約 v1.0.0 物件（見 Goals 第 4 節） |

## Goals

### 1. 目錄與檔名

```
lib/
  config.js                       # 既有，不動
  core/                           # 1.1 完成，不動
  server/
    analyze.js                    # analyzeRequest（server-only）
    validate-request.js           # LIMITS、validateRequest（server-only）
  contract/
    validate-analysis-json.js     # validateAnalysisJSON（是否 server-only 見待決定事項 1）
tests/
  analyze.test.js                 # 新增：不需要樣本的單元測試
  validate-analysis-json.test.js  # 新增
  core-modules.test.js            # 擴充：server-only／隔離檢查涵蓋 lib/server
  baseline.test.js                # 改用 analyzeRequest
  helpers/landmarks-pipeline.js   # 刪除
```

- `lib/server/*.js` 第一個 statement 一律是 `import "server-only";`（與 1.1 相同，靠 Vitest alias 指向 `tests/stubs/server-only.js`）。
- `lib/server/analyze.js` 只能透過 `../core/index.js` 使用核心，不可直接 import `lib/core/` 的子模組（1.1 已約定 `index.js` 是唯一入口）。
- 專案還沒設定 `@/` 別名，一律使用相對路徑加 `.js` 副檔名。
- 檔名與舊檔對應，方便逐檔比對：`analyze.js`、`validate-request.js`。`validate-analysis-json.js` 是從 `js/analyzer.js` 取出的單一函式。

### 2. `lib/server/validate-request.js`（逐字照搬）

- `LIMITS`、`CAMERA_MODES`、`isNum`、`validateRequest` **逐字照搬**，包括 `details` 的中文訊息、最多 20 筆的上限、每幀遇到第一個錯誤點就 `break` 的行為。
- 允許的改動只有：第一行加 `import "server-only";`，以及檔頭註解。`LIMITS`、`validateRequest` 本來就是 `export`。
- 回傳形狀不變：`{ ok: true, details: [] }`／`{ ok: false, details }`／`{ ok: false, tooLarge: true, details }`。
- `LIMITS` 的 55／8 由此正式進入本專案，取代 `tests/helpers/landmarks-pipeline.js` 的區域常數。舊 Client `js/analyzer.js` 也有 `>= 55`／`< 8`，但 Client 搬入（3.2）後由 3.3 移除本地解算，不在 1.2 處理（見第 7 節）。
- `maxBodyBytes` 在 1.2 沒有使用者，照搬保留給 1.3。

### 3. `lib/server/analyze.js` — `analyzeRequest`

#### 3.1 輸入

`analyzeRequest(body)`：`body` 是 1.3 用 `JSON.parse` 解析後的值，型別不限（可能是 `null`、陣列、字串等），由 `validateRequest` 判斷。欄位定義同舊 `docs/server-api.md`「請求」一節：

| 欄位 | 必填 | 型別／範圍 | 預設 |
| ---- | ---- | ---------- | ---- |
| `frameWidth`、`frameHeight` | 是 | 0 < x ≤ 16384 | — |
| `frames` | 是 | 陣列，≤ 3000；每項 `{ t: 0~86400, lm: 33 × [x, y, visibility] }` | — |
| `heightCm` | 否 | 50 ~ 250 | `APP_CONFIG.defaults.heightCm`（172） |
| `cameraMode` | 否 | `"auto"｜"static"｜"tracking"` | `APP_CONFIG.defaults.cameraMode`（`"auto"`） |
| `runDirection` | 否 | `1｜-1` | `1` |
| `isManualDirection` | 否 | boolean | `false` |
| `profileName` | 否 | 字串，≤ 200 字 | 不帶（有值才原樣帶回） |

不新增欄位，也不改預設值。

#### 3.2 輸出（建議形狀，見待決定事項 2）

`analyzeRequest` 不回傳 HTTP 狀態碼，改成回傳判別聯集（discriminated union），由 1.3 對應狀態碼：

```js
// 成功
{ ok: true, result }                                       // result：契約 v1.0.0 物件
// 失敗
{ ok: false, error: "invalid_request", details: string[] }
{ ok: false, error: "payload_too_large", details: string[] } // details 只供 log／測試，1.3 回應不帶（與舊行為一致）
{ ok: false, error: "insufficient_frames", acceptedFrames: number }
```

- 同時匯出 `ANALYZE_ERRORS = ["invalid_request", "payload_too_large", "insufficient_frames"]`（或同義的常數物件），讓 1.3 寫對應表、測試檢查沒有遺漏。
- 1.3 的對應（寫在本規格，供 1.3 參考，1.2 不實作）：`invalid_request` → 400 `{ error, details }`；`payload_too_large` → 413 `{ error }`；`insufficient_frames` → 422 `{ error, acceptedFrames }`；`ok: true` → 200 `result`。對應後的 HTTP 回應應與舊 Server **完全相同**。
- **非預期例外不攔截**：`analyzeRequest` 不加 `try/catch`。核心若丟出例外，由 1.3 統一轉成 500 `internal_error`，不回傳 stack（與舊 `http-handler.js` 相同）。
- 判斷順序不變：`validateRequest` 失敗時先看 `tooLarge`，再看其他錯誤。

#### 3.3 流程（逐字照搬，零行為變更）

照舊 `analyze.js` 的順序，每一行都保留：

1. `validateRequest(body)`；失敗時依 3.2 回傳。
2. `heightCm`／`cameraMode`／`isManualDirection` 的 `??` 預設值。
3. 擷取迴圈：`lm` 轉成 `{ x, y, visibility: v === null ? undefined : v }`；`extractAnglesFromLandmarks(lm, frameWidth, frameHeight, { runDirection, isManualDirection, heightCm, videoTime: f.t })`；方向沿用 `res.runDirection`；`evaluateCaptureFrame` 閘門；`finalize` 時中止；`accept` 時 push，滿 `LIMITS.maxAcceptedFrames` 時中止。
4. 幀數 < `LIMITS.minAcceptedFrames` → `insufficient_frames`。
5. `analyzeCapturedFrames(frames, { heightCm, cameraMode, canvasW: body.frameWidth, runDirection })`；`summary = plain(rawSummary)`。
6. `computeGctMetrics(summary, cadence)`；`isBiomechanicalRunner` 判斷式**照抄**（`summary.avgElbow != null && summary.avgElbow <= 100 && (summary.hipRomDeg || 38) >= 36`），不抽共用函式（見第 7 節）。
7. 組成契約物件（第 4 節），`cycleKeyframes: plain(buildCycleKeyframesFromSummary(summary, cadence, 100))`。

允許的改動只有：

- 加 `import "server-only";`；`loadCore()` 改成 `import * as core from "../core/index.js"`（保留 `core.xxx` 呼叫寫法，讓逐行 diff 只剩 import 不同）或具名 import。建議用 `import * as core`，diff 最小。
- 回傳值依 3.2 改形狀（`{ status: 200, body: result }` → `{ ok: true, result }`，其餘類推）。
- `plain()` **保留**（`JSON.parse(JSON.stringify(v))`）。舊註解說是為了 vm 跨 realm，ES module 沒有這個問題，但 `plain` 同時會去掉 `undefined` 欄位、把 `NaN`／`Infinity` 轉成 `null`，影響 `computeGctMetrics`／`calculateOverallRunningScore` 讀到的 `summary` 與回應內容。拿掉就可能改變行為，所以照留，只把註解改成「轉成純 JSON 值（去除 undefined 等），讓計算與回應都使用序列化後的同一份 summary」。
- 檔頭註解改寫成現況（server-only ES module、框架無關、1.3 Route Handler 只負責 HTTP）。

不允許：加防呆、改預設值、改欄位順序、改 `timestamp` 產生方式、加輸出欄位（例如 `indicatorScores`）、在 `analyzeRequest` 內呼叫 `validateAnalysisJSON` 自我檢查（舊 Server 沒有，加了就是行為變更；改由測試保證）。

### 4. 回應：契約 v1.0.0 欄位

成功時的 `result`，**欄位與順序**與舊 `analyze.js` 相同：

| 欄位 | 值 | 契約 |
| ---- | -- | ---- |
| `schemaVersion` | `APP_CONFIG.analysisSchemaVersion`（`"1.0.0"`） | 必填 |
| `version` | `APP_CONFIG.version`（`"V3.29"`） | 選填 |
| `source` | `"server"` | 選填 |
| `timestamp` | `new Date().toISOString()` | 選填 |
| `profileKey` | `"custom_captured"` | 選填 |
| `profileName` | 只在 `body.profileName !== undefined` 時出現，原樣帶回 | 選填（可能含個資） |
| `cameraMode`、`heightCm` | 套用預設值後的請求值 | 選填 |
| `cadence` | `analyzeCapturedFrames` 結果 | **必填** |
| `strideMeters` | `summary.strideMeters` | 選填 |
| `isManualStride` | `false` | 選填 |
| `phaseTiming` | `summary.phaseTiming` | 選填 |
| `summary` | `plain(rawSummary)` | **必填**（含 8 個必填子欄位） |
| `metrics` | `{ gctMs, flightMs, isWalking, overallScore }`；`isWalking = cadence < 135 && !isBiomechanicalRunner` | 預留（契約 §2.4） |
| `cycleKeyframes` | 101 幀，`model: "angles-sagittal-v1"` 等 | 選填（契約 §2.5） |

`schemaVersion` 維持 `"1.0.0"`：本 Feature 沒有新增、移除或改名任何欄位。

### 5. `validateAnalysisJSON`（逐字照搬）

- 從舊 `js/analyzer.js` 第 239–294 行**逐字照搬**，改成 `export function`，並從 `../config.js` import `APP_CONFIG`。其餘不變：
  - 根節點不是物件（含 `null`、陣列）→ `ok: false`，`errors: ["JSON 根節點必須是物件"]`。
  - 沒有 `schemaVersion`（`undefined`／`null`）→ `legacy: true`、`ok: true`，不檢查其他欄位。
  - 不符合 `MAJOR.MINOR.PATCH` → `ok: false`；MAJOR 大於 `APP_CONFIG.analysisSchemaVersion` 的 MAJOR → `ok: false`。
  - MAJOR 相同（含較低）時：`cadence` 不是 number → warning；`summary` 是物件時，8 個必填子欄位不是 number → warning。`summary` 缺少時**不產生 warning**（舊 Client 由匯入流程另外 alert）。
  - 只檢查型別，不檢查值域（契約 §2.2）。
- 在 1.2 的用途：只在測試中驗證 `analyzeRequest` 的成功結果，**正式程式不呼叫**。Epic 3 的 JSON 匯入會使用它（見待決定事項 1）。
- 契約 §2.2 的值域、§2.3 的 `phaseTiming` 單調性、§2.5 的關鍵幀規則屬於「產生端義務」，`validateAnalysisJSON` 不檢查。1.2 另外在測試中寫一個 `expectProducerContract(result)` 輔助函式（放在測試檔內，不放進 `lib/`）檢查這些規則，見第 6 節。

### 6. 測試

#### 6.1 `tests/analyze.test.js`（不需要樣本，永遠會執行）

- `LIMITS` 與舊值**完全相等**（`toStrictEqual` 整個物件，含 55／8）。
- `ANALYZE_ERRORS` 恰好是三個錯誤類型。
- 錯誤案例（移植 `verify.mjs` 的 `verifyErrors`，改成斷言錯誤類型）：

  | 案例 | 預期 |
  | ---- | ---- |
  | `null` | `invalid_request`，details 含「body 必須是 JSON 物件」 |
  | 陣列、字串 | `invalid_request` |
  | `frames: 1` | `invalid_request` |
  | `lm` 少於 33 點 | `invalid_request` |
  | 座標為字串 | `invalid_request` |
  | 座標 `1e300` | `invalid_request` |
  | `heightCm: 1e308` | `invalid_request` |
  | `visibility: 2` | `invalid_request` |
  | `cameraMode: "x"`、`runDirection: 0`、`isManualDirection: "true"`、`profileName` 201 字 | `invalid_request` |
  | 3001 幀 | `payload_too_large` |
  | 5 幀同一組 landmarks | `insufficient_frames`，`acceptedFrames` < 8 |

- 每個失敗結果 `ok === false`，且 `JSON.stringify` 後不含 `stack`。
- `validateRequest` 的 `details` 最多 20 筆（例如 30 幀都錯）。
- 邊界值通過驗證：`heightCm` 50／250、`frameWidth` 16384、`visibility` `null`／`0`／`1`、座標 ±5。

#### 6.2 `tests/validate-analysis-json.test.js`（不需要樣本）

- 根節點 `null`／陣列／數字 → `ok: false`。
- 無 `schemaVersion` → `legacy: true`、`ok: true`、`warnings: []`。
- `"1.0"`、`"v1.0.0"` → 格式錯誤；`"2.0.0"` → 主版本不支援；`"1.5.3"`、`"0.9.0"` → `ok: true`。
- `schemaVersion: "1.0.0"` 但缺 `cadence`、`summary.avgElbow` 是字串 → 對應 warning；缺 `summary` → 沒有 summary 相關 warning。
- `schemaVersion: 1`（數字）→ 轉字串 `"1"` 後格式錯誤（照舊行為）。

#### 6.3 `tests/baseline.test.js`（改用 `analyzeRequest`，以 `REQUIRE_BASELINE=1 npm test` 執行）

- 移除 `import … from "./helpers/landmarks-pipeline.js"`；`plain` 改成測試檔內的區域函式。
- **walk summary 路徑**、**關鍵幀 `kf-*-101`**：保持 1.1 寫法不變（這兩條本來就不經過 `analyzeRequest`）。斷言 103／361ms／0／96 與 JSON 字串逐字相同。
- **landmarks 路徑**（woman03／walkrun-a／walkrun-b）改成：
  1. `const out = analyzeRequest(load("landmarks-<名稱>.json"))`；`out.ok === true`。
  2. `result.cadence` 等於 `BASELINE.landmarks`（193／176／150）且等於 `client.cadence`。
  3. `result.summary` 與 `client.summary` `toStrictEqual`（數值容差 0）。
  4. `result.metrics` 的 `gctMs`／`flightMs`／`overallScore` 與 `client.metrics` 完全相同（woman03 193／118／66、walkrun-a 192／149／90、walkrun-b 230／170／75）；`isWalking` 三份皆為 `false`（步頻都 ≥ 135）。
  5. `JSON.stringify(result.cycleKeyframes) === JSON.stringify(plain(buildCycleKeyframesFromSummary(result.summary, result.cadence, 100)))`；共 101 幀，每幀與 `generatePoseMethodAlignedCycle(p, client.summary, client.cadence)` 的 12 個數值欄位差 ≤ 1e-9，`rIsStance`／`lIsStance` 相同（沿用 1.1）。
  6. 頂層欄位：`Object.keys(result)` 依序等於第 4 節的清單（樣本沒有 `profileName`，所以不含此欄）；`schemaVersion === "1.0.0"`、`version === APP_CONFIG.version`、`source === "server"`、`profileKey === "custom_captured"`、`cameraMode`／`heightCm` 等於請求值、`strideMeters === result.summary.strideMeters`、`isManualStride === false`、`phaseTiming` 與 `result.summary.phaseTiming` 相等；`timestamp` 是 ISO 8601 且 `new Date(timestamp).toISOString() === timestamp`。
  7. `plain(result)` 與 `result` `toStrictEqual`（回應已是純 JSON，序列化不會再改變內容）。
  8. `validateAnalysisJSON(result)`：`ok: true`、`legacy: false`、`errors: []`、`warnings: []`。
  9. `expectProducerContract(result)`：`cadence` 介於 60–240；`touchdownKnee`／`minSwingKnee`／`avgElbow` 介於 0–180；`summary.strideMeters > 0`；`touchPct ≤ posePct ≤ fallPct ≤ pullPct`；關鍵幀 `p` 嚴格遞增、首幀 `p = 0`、末幀 `p = 1` 且其餘欄位與首幀相同。**若這一項失敗，代表舊核心原本就不符合產生端義務：停下來回報並記錄，不可修改核心**（可改成 `it.fails` 或在 Notes 說明，交使用者決定）。
- 另加一個 `profileName` 案例：在 woman03 請求加上 `profileName: "測試"`，結果 `profileName === "測試"`，且除 `profileName`、`timestamp` 外與第 1 點結果 `toStrictEqual`。
- `BASELINE` 常數補上三份 landmarks 的 `gctMs`／`flightMs`／`overallScore`，失敗訊息指出樣本名稱與欄位。

#### 6.4 `tests/core-modules.test.js`（擴充）

- 「第一個 statement 是 `import "server-only"`」的檢查涵蓋 `lib/server/*.js`（以及待決定事項 1 若選 server-only，則含 `lib/contract/`）。
- 「不出現 `document`／`window`」涵蓋 `lib/server/` 與 `lib/contract/`。
- `lib/server/analyze.js` 原始碼不出現 `from "../core/` 開頭但不是 `../core/index.js` 的 import。
- 若 `lib/contract/` 不是 server-only：檢查它只 import `../config.js`，不 import `lib/core`／`lib/server`（避免核心經由它被帶進瀏覽器）。

#### 6.5 刪除 `tests/helpers/landmarks-pipeline.js`

- 刪除後 `tests/helpers/` 若為空，一併移除目錄。
- 用 `Grep` 確認 repo 內沒有 `landmarks-pipeline`／`runLandmarksPipeline` 的引用（`context/features/1-1-*.md` 等歷史文件除外）。

### 7. 門檻 55／8 與判斷式重複（建議：1.2 不合併，只記錄）

- **55／8**：1.2 讓它們成為 `LIMITS.maxAcceptedFrames`／`minAcceptedFrames`，Server 端只剩這一個來源（helper 刪除後）。Client `js/analyzer.js` 的 `>= 55`／`< 8` 在 3.2 原樣搬入時會暫時重複，3.3 移除本地解算時一併消失。在路線圖「待處理」記錄。
- **`isBiomechanicalRunner`／`isWalking`**：`lib/server/analyze.js` 照抄，與核心內 `generatePoseMethodAlignedCycle`、`computeAutoStrideMeters`、`calculateOverallRunningScore` 及舊 `renderer.js` 的寫法並存。各處空值行為不完全相同（`computeAutoStrideMeters` 有 `profileSummary &&` 前置檢查、`hipRomDeg` 來源不同；`detectCadenceFromFrames` 用幀統計的 `isBiomechanicalRunning`）。
- **建議**：1.2 不合併，理由：(a) 合併會改到 1.1 剛逐字搬好的核心檔，破壞「逐字 diff 審查」；(b) 三份 landmarks 樣本步頻都 ≥ 135，`isWalking` 的 `true` 分支與「步頻 < 135 但判定為跑者」的分支都沒有 landmarks 樣本覆蓋，無法用 baseline 證明合併後等價；(c) `renderer.js` 的寫法要到 3.2 搬入後才能一起看。
- 改成另開 `refactor-` Feature（建議放在 3.2 之後），開工前先補「步頻 < 135」與「avgElbow／hipRomDeg 為 null」的對照樣本或固定值測試。路線圖「待處理」該條更新為此內容。

### 8. 文件同步

- `docs/planning/epics-and-features.md`：1.2 狀態；1.2 說明補上「`analyzeRequest` 回傳錯誤類型，狀態碼由 1.3 對應」；「待處理」55／8 一條改成第 7 節的結論；1.3 說明補上「錯誤類型 → 狀態碼對應、`maxBodyBytes` 讀 body 上限」。
- `docs/analysis-json-contract.md`：本專案目前沒有這份文件。見待決定事項 3（建議：1.2 從舊專案複製進來，成為本專案的契約正本）。
- `docs/server-api.md`：不在 1.2 新增，1.3 有 Route Handler 後再寫。
- `README.md`：本專案目前沒有。1.2 不新增（沒有對外介面可說明）；版本號不動。
- `lib/core/index.js` 註解「1.2 之後的正式程式只能經由本檔使用核心」維持不變。

## 待決定事項（開工前確認）

1. **`validateAnalysisJSON` 放哪裡、要不要 server-only？**
   - A：`lib/contract/validate-analysis-json.js`，**不加** `server-only`。它不含核心演算法，只依賴 `APP_CONFIG`；Epic 3 的 JSON 匯入在瀏覽器需要它。用 6.4 的測試保證它不 import 核心。
   - B：`lib/server/validate-analysis-json.js`，加 `server-only`，與其他 1.2 檔一致；Epic 3 要在 Client 用時再搬出來。
   - （建議 A：AGENTS.md 要求 server-only 的是「核心演算法」，這個函式不是；放在 B，3.x 一定要再搬一次。）
2. **`analyzeRequest` 的回傳形狀？**
   - A：3.2 的判別聯集 `{ ok, result }`／`{ ok: false, error, … }`，1.3 對應狀態碼。
   - B：照舊回傳 `{ status, body }`，1.3 直接轉送。
   - （建議 A：符合「1.2 不做 HTTP」；錯誤類型名稱沿用舊 `error` 字串，1.3 對應後的 HTTP 回應與舊 Server 完全相同。B 的 diff 最小，但讓框架無關的模組帶著 HTTP 語意。）
3. **契約文件要不要複製進本專案？**（建議：要。把舊 `docs/analysis-json-contract.md` 原樣複製到 `docs/analysis-json-contract.md`，只加檔頭一段說明「源自舊專案；本專案的產生端是 `lib/server/analyze.js`，驗證函式是 `validate-analysis-json.js`；第 1 節的盤點描述的是舊 Client」，並在「修訂紀錄」加一條 1.2（搬遷，無欄位變更，`schemaVersion` 維持 `1.0.0`）。不複製的話，本專案沒有契約正本，1.3／Epic 3 都要回頭查舊專案。）
4. **55／8 與判斷式合併**：是否如第 7 節，1.2 只記錄、另開 refactor？（建議：是。）
5. **`expectProducerContract` 失敗時的處理**：若舊核心輸出本來就不符合某項產生端義務，是否接受「記錄、不修」？（建議：是；修正屬演算法變更，另開 `fix-`。）
6. **是否做一次「舊 Server vs 新 Server」完整對照**（Verification 第 3 步）？會在 scratchpad 寫一次性腳本 import 舊專案的 `server/lib/analyze.js`（唯讀執行，不改舊專案、不提交）。（建議：做，這是零行為變更最直接的證據。）

## Out of scope

- Route Handler `/api/analyze`、HTTP 狀態碼、Content-Type、讀 body 與 `maxBodyBytes`、`internal_error`、安全標頭（1.3）。
- Origin／`Sec-Fetch-Site` 檢查、限流、存取控制模組（Epic 2）。舊專案的 API Key（`auth.js`、`access-config.js`）不搬，本專案改用方案 A。
- 任何 UI、頁面或 Client 程式；`buildSafeSummaryFromJSON`、`importAnalysisJSON`（Epic 3）。
- 修改 `lib/core/` 的任何檔案；演算法修正；判斷式合併；新增 `metrics.indicatorScores`；契約升版。
- 修改舊專案；新增 npm 依賴；提交 `.temp/` 樣本。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。** 1.2 沒有任何 `app/` 檔案 import `lib/server`，build 成功只代表沒有破壞現有頁面；可打包性由第 4 步確認。
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（`analyze.test.js`、`validate-analysis-json.test.js`、`core-modules.test.js`、`baseline.test.js`、`config.test.js`）。基準：walk 103／361ms／96；`kf-walk-101`／`kf-hsu-101` 逐字相同；三份 landmarks 193／176／150 與 client 樣本 `toStrictEqual`。另跑一次不帶變數的 `npm test`，確認缺樣本時 baseline 仍是 skip（不需樣本的新測試照常執行）。
3. **零行為變更審查**：
   - 逐字 diff：`lib/server/validate-request.js` 對舊 `server/lib/validate-request.js`、`lib/contract/validate-analysis-json.js` 對舊 `js/analyzer.js` 第 239–294 行、`lib/server/analyze.js` 對舊 `server/lib/analyze.js`（例如 `git diff --no-index`，暫存檔放 scratchpad）。差異只能出現在 import、`export`、檔頭註解、`plain` 註解與回傳形狀。
   - 舊新完整對照（依待決定事項 6）：在 scratchpad 寫一次性腳本，對三份 landmarks 與 `verify.mjs` 的 9 個錯誤案例，分別呼叫舊 `analyzeRequest` 與新 `analyzeRequest`；成功案例比較 `body` 與 `result`（刪除 `timestamp` 後 `JSON.stringify` 完全相同），錯誤案例比較狀態碼與錯誤類型、`details`／`acceptedFrames` 相同。結論寫進 Notes。
4. **server-only 不進瀏覽器 bundle**（暫時修改，確認後還原）：
   - 負向：新增一個 `"use client"` 元件 import `lib/server/analyze.js`，在 `app/page.js` 使用，`npm run build` **預期失敗**且錯誤訊息指出 `server-only`。
   - 正向：Server Component `app/page.js` import `lib/server/validate-request.js` 並讀 `LIMITS.maxAcceptedFrames`，`npm run build` 成功。
   - 若待決定事項 1 選 A：再讓一個 `"use client"` 元件 import `lib/contract/validate-analysis-json.js`，build 應成功，且 `.next/static/` 搜尋不到核心特有字串（例如 `"嚴重跨步煞車或身後推蹬"`）。
   - 全部還原，`git status` 回到只有本 Feature 的變更。
5. **不需要 Playwright／互動驗證**：1.2 沒有 UI、頁面或 API 端點變更（Route Handler 在 1.3），`AGENTS.md` 第 3、4 項的條件不成立。在 Notes 註明「無 UI／API 變更，略過 Playwright 與 curl」。
6. `tests/helpers/landmarks-pipeline.js` 已刪除且沒有殘留引用；`git status` 只有本 Feature 的檔案；`.temp/` 未被提交；舊專案沒有任何變更。

## 風險

- **`plain()` 的語意**：舊程式用它處理 vm realm，但它同時決定了 `undefined`／`NaN` 的處理方式。如果實作時「因為沒有 realm 問題」而移除，`summary` 與 `cycleKeyframes` 可能改變，而且 `toStrictEqual` 不一定測得出所有情況（例如樣本剛好沒有 `undefined` 欄位）。規格要求保留，審查時要特別確認。
- **`isWalking` 覆蓋不足**：三份 landmarks 樣本步頻都 ≥ 135，`isWalking` 只驗到 `false`。walk 樣本（步頻 103）是 summary 匯出檔，不經過 `analyzeRequest`。`true` 分支與「步頻 < 135 但判定為跑者」只能靠逐字 diff 保證。可在 Notes 記錄，之後錄一份行走 landmarks 樣本補上。
- **`timestamp` 不可重現**：每次呼叫都不同，比對時必須排除；測試只檢查格式。若之後要做 snapshot，再另外考慮注入時鐘（1.2 不加參數，避免改簽名）。
- **回傳形狀改變**：選擇判別聯集後，1.3 必須正確對應三種錯誤，否則 HTTP 行為會偏離舊 Server。1.3 規格要沿用第 3.2 節的對應表，並以 `verify.mjs` 的錯誤案例逐一驗證狀態碼。
- **`validateAnalysisJSON` 放置**：若選非 server-only，日後有人在該檔 import 核心，核心就會進到瀏覽器 bundle。用 6.4 的 import 白名單測試防止。
- **產生端義務未被驗證過**：舊 Server 從未用 `validateAnalysisJSON` 或值域規則檢查自己的輸出。`expectProducerContract` 可能第一次發現既有不一致，處理方式依待決定事項 5，不在 1.2 修正。
- **`profileName` 個資**：原樣帶回、不記錄。1.2 沒有 log；1.3 與 Epic 2 須維持「不記錄請求內容」。
