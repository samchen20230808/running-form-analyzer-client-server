# Feature 1.1 — 核心純計算模組搬成 ES module

## Status

`in-progress`

## Epic

Epic 1 — 核心演算法 ESM 化（server-only）

## Objective

把舊專案用 `node:vm` 載入的全域 script 核心（`js/biomechanics.js`、`keyframes.js`、`landmark-extract.js`、`cycle-analysis.js` 與 `server/lib/keyframes-builder.js`）搬成本專案的 server-only ES module。依賴改成顯式 `import`／`export`，**計算行為零變更**，並用 Vitest 與 baseline 逐值比對證明。1.2 的 `analyzeRequest` 之後直接 import 這組模組，不再需要 `load-core.js`。

## 舊專案現況（唯讀盤點結果）

舊專案由 `server/lib/load-core.js` 用 `vm.createContext({ console })` 依序執行 `config.js → biomechanics.js → keyframes.js → landmark-extract.js → cycle-analysis.js → server/lib/keyframes-builder.js`，最後取出 9 個名稱：`APP_CONFIG`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame`、`analyzeCapturedFrames`、`computeGctMetrics`、`calculateOverallRunningScore`、`buildCycleKeyframesFromSummary`、`generatePoseMethodAlignedCycle`、`CYCLE_KEYFRAME_NUMERIC_FIELDS`。

| 舊檔 | 頂層宣告 | 跨檔依賴（全域） | DOM／Client 狀態 |
| ---- | -------- | ---------------- | ---------------- |
| `js/config.js` | `APP_CONFIG`、`applyAppConfig`、`RUNNER_PROFILES` | `RUNNER_PROFILES.*.evalCycle` 呼叫 `evaluateProfileAngles`（keyframes.js） | `applyAppConfig` 寫 `document`（只在呼叫時存取，載入時不碰） |
| `js/biomechanics.js` | `computePersonalizedPhaseTiming`、`computeGctMetrics`、`generatePoseMethodAlignedCycle`、`evaluateProfileCycle`、`getActiveRunnerTiming`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`parseManualStrideValue`、`solveKinematics` | `evaluateProfileCycle` 讀 `RUNNER_PROFILES`；`getActiveRunnerTiming` 讀 `RUNNER_PROFILES` 與 `activeProfileKey`（`js/state.js`），並**改寫** profile 的 `summary.phaseTiming` | 不碰 DOM；兩個函式依賴 Client 狀態 |
| `js/keyframes.js` | `CYCLE_KEYFRAME_NUMERIC_FIELDS`、`CYCLE_KEYFRAME_MIN_FRAMES`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles` | `evaluateProfileAngles` → `generatePoseMethodAlignedCycle` | 無 |
| `js/landmark-extract.js` | `extractAnglesFromLandmarks`、`evaluateCaptureFrame` | 無 | 無 |
| `js/cycle-analysis.js` | `calculateOverallRunningScore`、`detectCadenceFromFrames`、`computeCycleSummaryStats`、`computeMeasuredPixelStride`、`analyzeCapturedFrames` | `analyzeCapturedFrames` → `computeStrideForCameraMode`、`computePersonalizedPhaseTiming` | 無 |
| `server/lib/keyframes-builder.js` | `buildCycleKeyframesFromSummary` | → `generatePoseMethodAlignedCycle`、`CYCLE_KEYFRAME_NUMERIC_FIELDS` | 無 |

結論：

- 相依方向是單向的：`biomechanics ← keyframes`、`biomechanics ← cycle-analysis`、`biomechanics + keyframes ← keyframes-builder`，`landmark-extract` 不依賴其他檔案，沒有循環依賴。
- 9 個對外名稱與其遞移依賴都不碰 DOM，也不讀寫 Client 狀態。
- 只有 `evaluateProfileCycle`、`getActiveRunnerTiming`（以及 `RUNNER_PROFILES` 本身）依賴 Client 的可變狀態。舊 `js/analyzer.js` 會改寫 `RUNNER_PROFILES.custom_captured`、新增動態 key、掛 `cycleKeyframes`，`ui.js` 也會改 `name`。
- 這些 baseline 值已用舊核心（vm 載入、唯讀）重新跑過，結果與下文一致：walk cadence 103／gctMs 361／flightMs 0／總分 96；`kf-walk-101`、`kf-hsu-101` 關鍵幀 JSON 字串完全相同；client 步頻 176／150／193。

## Goals

### 1. 目錄與檔名

```
lib/
  config.js              # 既有，APP_CONFIG（非 server-only，UI 也會用）
  core/
    biomechanics.js
    keyframes.js
    landmark-extract.js
    cycle-analysis.js
    keyframes-builder.js # 由舊 server/lib/ 搬入，與其他核心檔放在一起
    index.js             # 對外入口：只匯出舊 load-core 的 9 個名稱
tests/
  stubs/server-only.js   # Vitest 用的空模組
  helpers/landmarks-pipeline.js  # 測試專用：重現舊 analyzeRequest 的擷取迴圈（1.2 後改用正式 analyzeRequest）
  core-modules.test.js
  baseline.test.js       # 既有，擴充核心比對
```

- 檔名與舊檔一一對應，方便逐檔 diff 審查。
- `lib/core/index.js` 從 `../config.js` 轉匯出 `APP_CONFIG`，讓 1.2 可以用 `import * as core from "@/lib/core"`（或相對路徑）取得與舊 `loadCore()` 相同的形狀。`lib/config.js` 本身**不加** `server-only`。

### 2. `server-only` 的處理方式（Vitest 可 import）

- 每個 `lib/core/*.js`（含 `index.js`）第一行都是 `import "server-only";`。只放在 `index.js` 不夠，因為直接 import 子模組就能繞過。
- Next.js 16 會在內部處理 `server-only`，不需要安裝 npm 套件（見 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`「Preventing environment poisoning」）。Client Component 若 import 這些檔案，`next build` 會直接報錯。
- Vitest 不經過 Next 的 bundler，`server-only` 無法 resolve，會直接 import 失敗。做法是在 `vitest.config.mjs` 加 alias，指向空模組（Next 官方 Jest 範例也是把 `server-only` mapping 到空模組）：

  ```js
  // vitest.config.mjs（示意）
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.js", import.meta.url)),
    },
  },
  ```

  `tests/stubs/server-only.js` 只放一行註解，說明它只用在測試、正式 build 由 Next 處理。
- **不新增依賴**。若 `npm run lint` 因 `server-only` 未列在 `package.json` 而報錯（目前的 `eslint-config-next/core-web-vitals` 預期不會），先向使用者說明，再決定是否 `npm install server-only`。安裝後 Vitest 仍須保留 alias，因為該套件在非 `react-server` 條件下 import 會直接 throw。

### 3. 各檔搬遷方式（零行為變更）

共通規則：

- 函式本體**逐字照搬**。只允許三種改動：加 `import "server-only"`、加 `import { … } from "./x.js"`、在宣告前加 `export`。不改名、不改參數預設值、不改運算順序、不加防呆、不排版（Prettier 之類的重排也不做）。
- 原有的行內註解全部保留。檔頭註解裡描述「全域 script／載入順序／node:vm／Client 與 Server 共用」的句子改寫成現況（ES module、server-only），其餘不動。
- 每個檔案用 named export 匯出**所有**搬入的頂層宣告（不只 9 個對外名稱），讓測試可以單獨驗證，也保留舊全域的可見性。`index.js` 只轉匯出 9 個名稱，這是 1.2 唯一應該使用的入口。
- 遷入 ES module 後是 strict mode。目前已確認：`generatePoseMethodAlignedCycle` 的 `solveWalkingLeg` 宣告在 `if (isWalking) { … }` 區塊內，且只在同一區塊使用，strict mode 的區塊作用域不影響結果；其餘巢狀函式都宣告在函式本體層。實作時若發現隱式全域或其他 sloppy-only 寫法，**停下來回報**，不要自行修正。
- `import` 一律寫相對路徑加 `.js` 副檔名，例如 `import { generatePoseMethodAlignedCycle } from "./biomechanics.js";`。

逐檔說明：

| 新檔 | 搬入內容 | import | 不搬（原因） |
| ---- | -------- | ------ | ------------ |
| `lib/core/biomechanics.js` | `computePersonalizedPhaseTiming`、`computeGctMetrics`、`generatePoseMethodAlignedCycle`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`parseManualStrideValue`、`solveKinematics` | 無 | `evaluateProfileCycle`、`getActiveRunnerTiming`：依賴 `RUNNER_PROFILES`／`activeProfileKey`，並改寫 Client 狀態，屬於 Client（見下方 RUNNER_PROFILES） |
| `lib/core/keyframes.js` | `CYCLE_KEYFRAME_NUMERIC_FIELDS`、`CYCLE_KEYFRAME_MIN_FRAMES`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles` | `generatePoseMethodAlignedCycle` ← `./biomechanics.js` | — |
| `lib/core/landmark-extract.js` | `extractAnglesFromLandmarks`、`evaluateCaptureFrame` | 無 | — |
| `lib/core/cycle-analysis.js` | `calculateOverallRunningScore`、`detectCadenceFromFrames`、`computeCycleSummaryStats`、`computeMeasuredPixelStride`、`analyzeCapturedFrames` | `computeStrideForCameraMode`、`computePersonalizedPhaseTiming` ← `./biomechanics.js` | — |
| `lib/core/keyframes-builder.js` | `buildCycleKeyframesFromSummary` | `generatePoseMethodAlignedCycle` ← `./biomechanics.js`；`CYCLE_KEYFRAME_NUMERIC_FIELDS` ← `./keyframes.js` | — |
| `lib/core/index.js` | 轉匯出 9 個名稱 | `APP_CONFIG` ← `../config.js`，其餘 ← 各核心檔 | — |

補充：

- `keyframes-builder` 在路線圖原本列在 1.2。1.1 把它一起搬過來，因為它是 9 個對外名稱之一、是純函式，而且 `kf-*-101.json` 基準要用它驗證。1.2 只剩 `analyzeRequest`、`validateAnalysisJSON`。完成時同步修改 `docs/planning/epics-and-features.md` 的 1.1／1.2 說明。
- 舊 `analyze.js` 用 `plain()`（JSON 往返）處理 vm 跨 realm 的物件。ES module 沒有 realm 問題，但 1.1 **不改核心回傳值**，測試比對時照舊先做 JSON 往返，結果才能和 JSON 樣本比較（例如 `undefined` 欄位的處理）。

### 4. `RUNNER_PROFILES` 的搬遷（建議：1.1 不搬進核心）

- `RUNNER_PROFILES` 不在 9 個對外名稱中，Server 端分析流程也用不到。它是 Client 的可變 UI 狀態：`analyzer.js` 改寫 `custom_captured`、新增動態 key，`ui.js` 改 `name`。每個 profile 的 `evalCycle` 還透過 `this` 呼叫 `evaluateProfileAngles`。
- 如果放進 server-only 核心，Client（Epic 3）就無法使用。如果放進非 server-only 模組，又會把 `evaluateProfileAngles → generatePoseMethodAlignedCycle` 一起拉進瀏覽器 bundle，違反「核心不進瀏覽器」。
- **決定（建議）**：1.1 不搬 `RUNNER_PROFILES`、`evaluateProfileCycle`、`getActiveRunnerTiming`，改列為 Epic 3 的待處理項目（3.1 盤點 Client 依賴時一併決定：Client 是否保留本地運動學退回路徑、profile 靜態資料放哪裡）。
- 同步修改 `lib/config.js` 檔頭註解：把「RUNNER_PROFILES 由核心搬遷（Feature 1.1）處理」改成「RUNNER_PROFILES 屬 Client 狀態，於 Epic 3 處理（見 1.1 規格）」。
- 在路線圖「待處理」新增一條：`RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 留在 Client，3.1 決定去向。

### 5. 門檻 55／8 與 `isWalking`／`isBiomechanicalRunner` 重複（決定：1.1 不合併，只記錄）

現況（唯讀盤點）：

- `55`／`8`：舊 `server/lib/validate-request.js` 的 `LIMITS.maxAcceptedFrames`／`minAcceptedFrames`，以及 Client `js/analyzer.js` 的 `capturedRawFrames.length >= 55`、`< 8`。**兩者都不在 1.1 搬遷的檔案內**，屬於 1.2（`analyzeRequest`／validate）與 Epic 3。
- `isBiomechanicalRunner`／`isWalking` 判斷式（`avgElbow != null && avgElbow <= 100 && (hipRomDeg || 38) >= 36`，`cadence < 135`）在核心內重複出現：`generatePoseMethodAlignedCycle`、`computeAutoStrideMeters`（`profileSummary &&` 前置檢查、`hipRomDeg` 來源不同）、`calculateOverallRunningScore`。`detectCadenceFromFrames`／`computeCycleSummaryStats` 則用幀統計得到的 `isBiomechanicalRunning`。核心以外還有舊 `analyze.js` 與 `renderer.js`。各處的空值行為不完全相同。

決定：

- 1.1 **完全不合併、不抽共用函式**，各處照原樣搬，目的是讓「零行為變更」能逐字審查。
- 在本規格（此節）與 `context/current-feature.md` Notes 記錄各處位置。路線圖既有的待處理項目改成「1.2 起處理（55／8 隨 validate 進來；判斷式合併須逐處確認空值行為，另開 refactor Feature 或併入 1.2，並以 baseline 驗證）」。

### 6. 測試

**`tests/core-modules.test.js`**（不需樣本，永遠會執行）：

- `lib/core/index.js` 的 export 名稱集合**恰好**是那 9 個；函式型別正確；`CYCLE_KEYFRAME_NUMERIC_FIELDS` 等於舊檔的 12 個欄位（依序）。
- `lib/core/` 底下每個 `.js` 檔第一個 statement 都是 `import "server-only";`（讀原始碼字串檢查）。
- `lib/` 底下沒有 `node:vm`／`from "vm"`；`lib/core/` 原始碼不出現 `document`、`window` 識別字（字串掃描即可）。
- 幾個不需要樣本的冒煙值（用核心公式就能確定）：例如 `computeGctMetrics({}, 103)` 回傳 `gctMs` 361、`flightMs` 0、`rating` `"walking"`。

**`tests/baseline.test.js`**（擴充；保留既有格式檢查）。以 `REQUIRE_BASELINE=1 npm test` 執行，缺樣本直接失敗；沒有設定時照舊 skip 並給提示。

1. **walk summary 路徑**（`running-form_captured-2026-10-29-walk.json`，比照舊 `verify.mjs` 的 `metricsFromSummary`）：
   - `summary = { ...w.summary, phaseTiming: w.phaseTiming }`，`cadence = w.cadence`。
   - 斷言：`w.cadence === 103`；`computeGctMetrics(summary, cadence).gctMs === 361`；`.flightMs === 0`；`calculateOverallRunningScore(summary, cadence) === 96`。
2. **關鍵幀**（`kf-walk-101.json`、`kf-hsu-101.json`）：
   - `summary = { ...kf.summary, ...(kf.phaseTiming ? { phaseTiming: kf.phaseTiming } : {}) }`（kf-walk 需合併，kf-hsu 的 summary 已含 phaseTiming，頂層也有）。
   - `JSON.stringify(plain(buildCycleKeyframesFromSummary(summary, kf.cadence, 100))) === JSON.stringify(kf.cycleKeyframes)`：**逐字相同**，不使用舊 verify 的 1e-9 容差（同一份程式碼不應有任何浮點差異；若不相同就代表搬遷有誤）。
   - 另外斷言 101 幀，cadence 分別為 103／184。
3. **landmarks 路徑**（`landmarks-{woman03,walkrun-a,walkrun-b}.json` 對照 `client-*.json`）：
   - 1.1 還沒有 `analyzeRequest`，所以用 `tests/helpers/landmarks-pipeline.js` **逐行重現**舊 `server/lib/analyze.js` 從 `heightCm`／`cameraMode` 預設值到 `computeGctMetrics`／`calculateOverallRunningScore` 這段（`lm` 轉 `{x, y, visibility: v === null ? undefined : v}`、方向沿用、`evaluateCaptureFrame` 閘門、`finalize` 中止、收滿 55 幀中止、少於 8 幀視為失敗）。55／8 在 helper 內寫成區域常數並加註「1.2 由 validate 的 LIMITS 取代」，不放進 `lib/`。helper 不做請求驗證。
   - 斷言：步頻分別是 woman03 193、walkrun-a 176、walkrun-b 150，且等於 `client.cadence`；`plain(summary)` 與 `client.summary` 完全相等（`toStrictEqual`，數值容差 0，含 `_measuredPixelStride`、`_autoDetectedStatic`、`measuredStrideMeters`、`phaseTiming`）；`gctMs`／`flightMs`／`overallScore` 與 `client.metrics` 完全相同（舊核心實測：woman03 193／118／66，walkrun-a 192／149／90，walkrun-b 230／170／75）。
   - 關鍵幀：`buildCycleKeyframesFromSummary(summary, cadence, 100)` 共 101 幀，每幀與 `generatePoseMethodAlignedCycle(p, client.summary, client.cadence)` 的 12 個數值欄位差 ≤ 1e-9，`rIsStance`／`lIsStance` 相同（對應舊 verify 的同名檢查）。
4. 基準數字集中在檔案頂端的 `BASELINE` 常數（沿用 0.2 的結構並補上 gct／score）；失敗訊息要指出樣本名稱與欄位。

### 7. 文件同步

- `lib/config.js` 檔頭註解（見第 4 節）。
- `docs/planning/epics-and-features.md`：1.1 狀態、1.1／1.2 說明（keyframes-builder 移到 1.1）、待處理項目（RUNNER_PROFILES、55／8 與判斷式合併改到 1.2 之後、「361／96 基準來源」一項標記已解決：由核心計算得出，比對方式見本規格）。
- `README.md`：若有「測試」段落，補上 `REQUIRE_BASELINE=1 npm test` 的用法；版本號不動（不是發版）。

## 待決定事項（開工前確認）

1. `RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 是否如第 4 節建議，1.1 不搬、改到 Epic 3？（建議：是。）
2. 55／8 與判斷式合併是否如第 5 節，1.1 只記錄、不合併？（建議：是。）
3. `keyframes-builder` 從 1.2 提前到 1.1？（建議：是，因為它屬於 9 個對外名稱，也是 kf 基準的依據。）
4. 子模組除了 9 個名稱以外，是否匯出所有搬入的函式？（建議：是，方便單元測試；1.2 以後的正式程式只能經由 `index.js` 使用。）
5. `server-only` 用 Vitest alias＋空 stub，不安裝套件？（建議：是；只有 lint 報錯時才另外詢問是否安裝。）

## Out of scope

- `analyzeRequest`、`validateRequest`／`validateAnalysisJSON`、`LIMITS`（1.2）；Route Handler `/api/analyze`（1.3）；存取控制（Epic 2）；任何 UI 或頁面變更（Epic 3）。
- `RUNNER_PROFILES`、`applyAppConfig`、`evaluateProfileCycle`、`getActiveRunnerTiming` 與舊 Client 其餘檔案（`analyzer.js`、`renderer.js`、`ui.js`、`report.js`、`pose.js`、`state.js`）。
- 任何演算法修正、判斷式合併、命名整理、格式化或效能調整。
- 修改舊專案。
- 新增 npm 依賴。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。** 注意：1.1 沒有任何 `app/` 檔案 import `lib/core`，所以 build 成功只代表沒有破壞現有頁面，不代表核心可以被 Next 打包。可打包性用第 4 步的暫時性檢查確認。
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（`core-modules.test.js`＋`baseline.test.js`＋既有 `config.test.js`）。另外跑一次不帶變數的 `npm test`，確認缺樣本時仍是 skip，不會失敗（可暫時改名 `.temp/json` 測試後還原，或在 Notes 說明理由後省略）。
3. **逐字搬遷審查**：對每個核心檔，把新檔去掉 `import "server-only"`、`import … from`、`export ` 前綴後，與舊檔做 diff（例如 `git diff --no-index`，比較用的暫存檔放 scratchpad 或 `.temp/`）。差異只能出現在檔頭註解與「不搬」的函式。把結論寫進 Notes。
4. **核心不進瀏覽器 bundle**：
   - 靜態：`core-modules.test.js` 確認每個核心檔都有 `import "server-only"`；`app/` 底下沒有 `"use client"` 檔案 import `lib/core`（1.1 應為零個 import）。
   - 負向（暫時，不提交）：新增一個 `"use client"` 元件 import `@/lib/core`（或相對路徑），並在 `app/page.js` 使用，執行 `npm run build`，**預期 build 失敗**且錯誤訊息指出 `server-only`。確認後還原，`git status` 回到乾淨。
   - 正向（暫時，不提交）：讓 Server Component `app/page.js` import `lib/core/index.js` 並讀一個值（例如 `CYCLE_KEYFRAME_NUMERIC_FIELDS.length`）。`npm run build` 應成功，並且 `.next/static/` 內搜尋不到核心特有的字串字面值（例如 `"🚶 行走步態 (雙腳交替支撐 • 零騰空)"`、`"嚴重跨步煞車或身後推蹬"`）。確認後還原。
   - 備註：Epic 3.2 原樣搬入舊 Client 檔案時，這些字串會合法出現在瀏覽器端，屆時這項字串檢查要重新設計（改成只檢查 Server 獨有的檔案，或改用其他標記）。
5. **不需要 Playwright／互動驗證**：1.1 沒有 UI、頁面或 API 變更（`app/` 在最後提交的狀態下不變，第 4 步的暫時修改都會還原），沒有可載入或可互動的新行為；`AGENTS.md` 第 3、4 項的條件不成立。在 Notes 註明「無 UI／API 變更，略過 Playwright」。
6. `git status` 只有本 Feature 的檔案；`.temp/` 未被提交；舊專案沒有任何變更。

## 風險

- **strict mode 差異**：全域 script 是 sloppy mode，ES module 是 strict mode。盤點時沒有發現隱式全域或區塊外使用區塊內函式，但實作時若出現 `ReferenceError`／`TypeError`，必須回報，不可以順手改寫邏輯。baseline 測試會涵蓋主要路徑（行走與跑步兩個分支都有樣本）。
- **未被 baseline 覆蓋的函式**：`solveKinematics`、`parseManualStrideValue`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles`、`computeStrideForCameraMode` 的 `static` 分支等，沒有 baseline 樣本覆蓋，只能靠第 3 步逐字審查保證。可另外補少量「舊核心 vs 新核心」的對照值（由舊核心離線算出後寫成常數）。是否要補，在實作時決定並記錄。
- **`server-only` 在 Vitest 被 alias 掉**：測試無法證明 server-only 的保護是否生效，只能靠第 4 步的負向 build 檢查。之後若有人移除 alias 或改 import 寫法，測試會直接 import 失敗，問題容易被發現。
- **landmarks helper 與 1.2 正式實作不同步**：helper 是暫時重現的程式碼。1.2 完成後必須改用 `analyzeRequest` 並刪除 helper，避免兩份流程並存。在 1.2 規格中列為必做項目。
- **限流、部署打包**：舊專案的 `outputFileTracingIncludes`／nft 檢查是為了 vm 讀檔才需要。ES module 由 bundler 靜態追蹤，1.1 不需要這項設定；1.3 有 Route Handler 之後再確認部署產物。

## 待確認事項

- 上方「待決定事項」1～5。
- 是否接受只用 `.temp/json/` 的未提交樣本作為 baseline（延續 0.2 決定：不提交 fixtures）。如果日後要做 CI，需要另開 Feature 處理去識別化 fixtures。
- `README.md` 目前是否有測試段落；若沒有，1.1 是否要新增（建議：新增一小段，說明 `REQUIRE_BASELINE=1 npm test` 與樣本來源）。
