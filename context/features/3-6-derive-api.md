# Feature 3.6 — 衍生值 API

## Status

`done`（第 14 節採建議預設即可開工；第 15 節未決事項待使用者回答，不阻擋開工）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

落實 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) **D5、D6 的 Server 端**：

1. **D5／契約 MINOR 1.1.0**：`POST /api/analyze` 的 `metrics` 新增選填欄位 `metrics.gct`，內容是 `computeGctMetrics(summary, cadence)` 的**完整回傳物件**（第 6.1 節）。`schemaVersion` 由 `1.0.0` 升為 `1.1.0`，其餘欄位與數值逐值不變。
2. **D6**：新增 `POST /api/derive`。以 `summary`、`cadence`、`heightCm`、`cameraMode` 為輸入（不含 landmarks、不含檔名），回傳 Client 目前在瀏覽器用 temp-core 算的所有衍生值：`metrics`（含 `gct`）、`phaseTiming`、機位步幅、自動步幅，以及選擇性的 101 幀 `cycleKeyframes`（供 D7 舊格式匯入補骨架）。
3. 沿用既有存取控制（`checkAccess`）、安全標頭、串流讀 body 與大小上限、錯誤碼慣例；HTTP 流程與 `/api/analyze` 共用同一份程式。

**只動 Server**：`public/`（含 `public/js/`、`index.html`、`public/modules/`、`public/legacy/temp-core/`）、`lib/player/`、`lib/landmarks/`、`lib/profiles/`、`lib/contract/` 不修改。UI 在 3.6 之後**仍用 temp-core 計算**，不呼叫 `/api/derive`、不讀 `metrics.gct`；改讀與移除 temp-core 是 3.7。部署防線不動，**仍不可部署**。

**零行為變更**：`REQUIRE_BASELINE=1 npm test` 的基準照舊——walk 樣本 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150（總分 66／90／75）。`/api/derive` 對同一份輸入的輸出，必須與 temp-core 在瀏覽器裡算出的值逐值相同（第 7 節）。

## 1. 目標與非目標

### 目標

1. 契約 1.1.0：`lib/config.js` 的 `APP_CONFIG.analysisSchemaVersion` 改為 `"1.1.0"`；`analyzeRequest` 的 `metrics` 加上 `gct`；契約文件新增欄位定義與修訂紀錄。
2. 新增 `lib/server/metrics.js`：`buildMetrics(summary, cadence)`，`/api/analyze` 與 `/api/derive` 共用，保證兩邊 `metrics` 同一來源。
3. 新增 `lib/server/derive.js`（`deriveRequest`）與 `lib/server/validate-derive-request.js`（`validateDeriveRequest`、`DERIVE_LIMITS`）。
4. `lib/server/http-handler.js` 抽出共用的 `handleJsonPost`，新增 `handleDeriveHttp`；`handleAnalyzeHttp` 對外行為與簽章不變。
5. 新增 `app/api/derive/route.js`（只 export `runtime = "nodejs"` 與 `POST`）。
6. `lib/core/index.js` 加入 derive 需要的 3 個函式（第 6.4 節），9 個名稱變 12 個。
7. 測試：1.1.0 回應、derive 逐值對照、HTTP 狀態碼與存取控制、結構與隱私限制（第 9 節）。
8. 文件如實更新：契約、`docs/server-api.md`、`docs/privacy.md`、決策文件、路線圖、README（第 12 節）。

### 非目標

- UI 改讀 `metrics.gct`／呼叫 `/api/derive`、`oninput` debounce、匯入舊格式時用 derive 補關鍵幀、移除 temp-core 與部署防線、bundle 完整移除驗收（**3.7**）。
- `public/js/config.js` 的 `analysisSchemaVersion` 同步（第 15 節第 2 點，建議 3.7）。
- `metrics.indicatorScores`（契約 §2.4 預留，仍不輸出）、`runDirection` 回傳（決策文件第 6 章「可選填」，3.6 不做）。
- UI 內嵌判斷門檻（D10）、`isWalking`／`isBiomechanicalRunner` 判斷式合併、評分公式任何修改。
- 限流改外部儲存、Turnstile、登入；部署與 push。
- `APP_CONFIG.version`（`V3.29`）不升版（非發版）。

## 2. 現況盤點

基準：本專案 `master` `ec069a1`（3.5 完成），工作區乾淨。行號以 Grep／Read 取得。

### 2.1 Server 現況

| 位置 | 內容 |
| ---- | ---- |
| `lib/server/analyze.js:68` | `const gct = core.computeGctMetrics(summary, cadence)`，只取 `gctMs`、`flightMs` 放進 `metrics`（`:85–90`） |
| `lib/server/analyze.js:72` | `schemaVersion: core.APP_CONFIG.analysisSchemaVersion`（現為 `"1.0.0"`） |
| `lib/server/analyze.js:73–90` | `isBiomechanicalRunner`／`isWalking` 判斷內嵌在 analyze（與 `calculateOverallRunningScore`、`computeAutoStrideMeters`、`generatePoseMethodAlignedCycle` 同公式，D10 待合併） |
| `lib/server/http-handler.js:30` | `readLimitedText(request)`：上限固定 `LIMITS.maxBodyBytes`（4 MB） |
| `lib/server/http-handler.js:55` | `handleAnalyzeHttp(request, { analyze, checkAccess })`：存取控制 → 415 → 413 → 400 → analyze |
| `lib/server/http-handler.js:100` | 唯一的 log：`console.error("analyze failed")`（`tests/privacy-docs.test.js` 斷言 `console.` 全專案只出現一次） |
| `lib/server/access-control.js` | `checkAccess` 為預設實例；同一 instance 內所有呼叫共用一個 IP 計數 `Map` |
| `lib/core/index.js` | 9 個名稱（`tests/core-modules.test.js:21` 斷言恰好 9 個）；**不含** `computePersonalizedPhaseTiming`、`computeAutoStrideMeters`、`computeStrideForCameraMode`。`lib/server/analyze.js:4` 註明「核心只能經由 `../core/index.js` 使用」 |
| `next.config.mjs` `headers()` | `/api/:path*` 已涵蓋新路由，安全標頭不需修改 |

### 2.2 Client 目前從 temp-core 算的衍生值（3.7 要改讀的對象）

| 位置 | 呼叫 | 用到的輸出 |
| ---- | ---- | ---------- |
| `public/index.html:1555` `updateTelemetryAndDiagnostics` | `computeGctMetrics(s, cadence)` | `gctMs`、`flightMs`、`hsuGctMs`、`diffMs`（KPI、診斷卡 `:1773–1905`），並傳給 `updatePhaseTimingUI` |
| `public/index.html:1513` `updatePhaseTimingUI`（備援） | `computeGctMetrics` | `stancePct`、`skipHsuCompare`、`diffMs`、`flightLabel`、`flightMs`、`gctMs`、`hsuGctMs`、`ratingText`、`ratingColor` |
| `public/js/renderer.js:220` 狀態牌 | `computeGctMetrics` | `stancePct`、`gctMs`、`flightLabel`、`flightMs` |
| `public/js/renderer.js:590` 波形色帶 | `computeGctMetrics` | `stancePct`、`gctMs`、`flightLabel`、`flightMs` |
| `public/index.html:1627` | `calculateOverallRunningScore(s, cadence)` | 總分 |
| `public/index.html:1572–1575` 非手動步幅 | `measuredStrideMeters > 0 ? measuredStrideMeters : computeAutoStrideMeters(s, heightCm, cadence)` | 遙測用步幅（**不看機位**） |
| `public/index.html:1357` `recalculateStrideForCameraMode` | `computeStrideForCameraMode(s, selectedCameraMode, heightCm, curCadence)` | `pixelVal`、`strideMeters`、`measuredStrideMeters`、`strideModeText`；呼叫端：`onCameraModeChange`、`resetStrideToAuto`、`onHeightInputChange`、`switchProfile`（`ui.js:201`）、`applyCapturedResult`（`analyzer.js:207`） |
| `public/js/analyzer.js:347`、`:352` `buildSafeSummaryFromJSON` | `computePersonalizedPhaseTiming` | 匯入時一次性正規化 `phaseTiming` |
| 匯入舊格式／無關鍵幀檔（3.5 起不顯示骨架） | — | D7：需 Server 產生 `cycleKeyframes` |

`report.js` 尚未搬入（3.8），不在此表。

### 2.3 `computeGctMetrics` 回傳物件（`lib/core/biomechanics.js:55`）

三個分支的鍵集合（探針實測，key 順序依原始碼）：

| 分支 | 條件 | 鍵 |
| ---- | ---- | -- |
| 行走 | `clamp(cadence, 60, 240) < 135` | `cadence, stepMs, cycleMs, gctMs, flightMs, stancePct, flightPct, hsuGctMs, hsuFlightMs, hsuStancePct, diffMs, skipHsuCompare, flightLabel, rating, ratingText, ratingColor, advice`（17 個） |
| 徐國峰基準 | `isHsu`（`trunkAngle` 7.8–8.6、`comOffsetCm ≤ 3.5`、`touchdownKnee ≤ 156`） | 上列去掉 `skipHsuCompare`、`flightLabel`（15 個） |
| 一般跑步 | 其餘 | 同上（15 個） |

- `cadence` 是 clamp 到 60–240 後的值，可能與輸入不同。
- `rating`：`walking`／`elite`／`good`／`long`／`excessive`。`ratingText`、`advice` 是繁中顯示文字，`ratingColor` 是 Tailwind class（例如 `text-purple-300`）。
- 探針（walk 樣本）：`{"cadence":103,"stepMs":583,"cycleMs":1165,"gctMs":361,"flightMs":0,"stancePct":31,"flightPct":19,"hsuGctMs":326,"hsuFlightMs":0,"hsuStancePct":31,"diffMs":0,"skipHsuCompare":true,"flightLabel":"雙腳支撐","rating":"walking",…}`；woman03 `rating: "good"`、`diffMs: 19`；walkrun-a／b `rating: "elite"`。

### 2.4 對 derive 輸出有影響的既有特性

- **`computePersonalizedPhaseTiming` 不冪等**：`phaseTiming.posePct` 為數字時只正規化，`pullPct < 68` → `min(85, pullPct + 20)`。Client 若把 derive 回傳的 `phaseTiming` 存回 summary 再送，下次會再加 20（3.5 修掉的漂移會回來）。第 6.3 節規定 Client 只在匯入時採用。
- **`generatePoseMethodAlignedCycle` 內部會再正規化一次 `phaseTiming`**（`biomechanics.js:180`），也讀 `strideMeters`（`:290` `strideBonusDeg`）。3.5 之前舊格式匯入的骨架就是「已正規化的 summary 再進模型」，derive 以送來的 summary 原樣產生關鍵幀即可重現。
- **`??` 與 `null`**：核心大量用 `x ?? 預設值`。JSON 沒有 `NaN`，Client 的 `Number("abc")`（`NaN`）序列化後變 `null`，Server 端會走預設值，而瀏覽器本地是 `NaN` 傳下去。這是 3.7 才會遇到的邊界差異（第 13 節）。
- `computeStrideForCameraMode` 不改寫輸入；「`_measuredPixelStride` 未設定時寫回 `pixelVal`」是 UI（`index.html:1365–1370`）的動作，3.7 仍由 UI 做。

## 3. Next.js 16.4.6 查證

- 新增 Route Handler `app/api/derive/route.js`，與 `app/api/analyze/route.js` 同形：`export const runtime = "nodejs"`、`export async function POST(request)`。依據 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`；`runtime` 見同目錄 `02-route-segment-config/`。
- 不改 `next.config.mjs`：`/api/:path*` 的 `headers()` 已涵蓋 `/api/derive`；非 POST 由 Next 自動回 405、`OPTIONS` 回 204（與 analyze 相同，Verification 第 3 步實測）。
- start 時依 AGENTS 重讀上述兩頁，確認沒有新的 deprecation。

## 4. 範圍

```
app/api/derive/route.js            # 新增：runtime + POST → handleDeriveHttp
lib/
  config.js                        # 修改：analysisSchemaVersion "1.0.0" → "1.1.0"（只改這一行）
  core/index.js                    # 修改：新增 3 個轉匯出（第 6.4 節）
  server/
    metrics.js                     # 新增：buildMetrics(summary, cadence)
    analyze.js                     # 修改：metrics 改用 buildMetrics（輸出多 gct，其餘逐值相同）
    derive.js                      # 新增：deriveRequest(body)、DERIVE_ERRORS
    validate-derive-request.js     # 新增：validateDeriveRequest(body)、DERIVE_LIMITS
    http-handler.js                # 修改：抽出 handleJsonPost；新增 handleDeriveHttp、DERIVE_ERROR_STATUS
tests/
  derive.test.js                   # 新增：第 9 節 R、K 組
  api-derive-route.test.js         # 新增：第 9 節 H 組
  baseline.test.js                 # 修改：schemaVersion 斷言改讀 APP_CONFIG；新增 metrics.gct 斷言
  profiles-bake.test.js            # 修改：P3 的 metrics 快照（:136）改為 4 欄位＋gct 斷言（數值不變）
  api-analyze-route.test.js        # 修改：只新增斷言（handleAnalyzeHttp 行為不變）
  core-modules.test.js             # 修改：9 → 12 個名稱；route 檔 import 限制擴及 derive
  config.test.js                   # 修改：analysisSchemaVersion 期望值
  privacy-docs.test.js             # 修改：log 字串兩個、文件含 derive
  validate-analysis-json.test.js   # 修改：只新增 1.1.0 案例
docs/analysis-json-contract.md、docs/server-api.md、docs/privacy.md、docs/client-server-boundary.md、docs/planning/epics-and-features.md、README.md
context/current-feature.md         # Notes
```

- **不修改**：`public/**`、`lib/player/`、`lib/landmarks/`、`lib/profiles/`、`lib/contract/`、`lib/core/{biomechanics,cycle-analysis,keyframes-builder}.js`、`lib/server/{access-control,validate-request}.js`、`app/api/analyze/route.js`、`next.config.mjs`、`vitest.config.mjs`、`eslint.config.mjs`、`scripts/`、`package.json`。
- **不新增依賴、不新增 npm script**。
- `public/modules/` 不受影響（`lib/config.js`、`lib/server/` 不在 `sync:legacy` 的 MANAGED 內），`npm run sync:legacy` 執行後 `git status` 應無差異（驗收第 6 點）。

## 5. 實作順序

1. 先跑 `REQUIRE_BASELINE=1 npm test`，記錄現況（214 通過）。在 scratchpad 用 `node --import ./scripts/server-only-hook.mjs` 寫一次性探針，對 walk 樣本、`kf-walk-101`／`kf-hsu-101` 的 summary、三份 `client-*.json` 與三個內建 profile，擷取 temp-core 同名函式的輸出（第 7.2 節對照表），存到 scratchpad。
2. `lib/core/index.js` 新增 3 個轉匯出；`tests/core-modules.test.js` 改 12 個。跑測試。
3. 新增 `lib/server/metrics.js`，`analyze.js` 改用它；`lib/config.js` 升 `1.1.0`；修改 `baseline.test.js`、`config.test.js`。跑 `REQUIRE_BASELINE=1 npm test`（**Server 零變更檢查點**：除 `schemaVersion` 與新增的 `metrics.gct` 外，三份 landmarks 結果逐值相同）。
4. 新增 `validate-derive-request.js`、`derive.js`；`tests/derive.test.js`（R、K 組）。
5. `http-handler.js` 抽出 `handleJsonPost`，新增 `handleDeriveHttp`；新增 `app/api/derive/route.js`；`tests/api-derive-route.test.js`（H 組）。先跑既有 `api-analyze-route.test.js`，必須**不修改既有案例**就全過。
6. 修改 `privacy-docs.test.js`、`validate-analysis-json.test.js`；跑 lint、build、test。
7. 依 Verification 做 HTTP 與 Playwright 檢查；更新文件（第 12 節）；把 Notes 寫入 `context/current-feature.md`。

## 6. 設計

### 6.1 契約 1.1.0：`metrics.gct`

```jsonc
"metrics": {
  "gctMs": 361, "flightMs": 0, "isWalking": false, "overallScore": 96,   // 1.0.0 既有，值不變
  "gct": {                                                              // 1.1.0 新增，選填
    "cadence": 103, "stepMs": 583, "cycleMs": 1165,
    "gctMs": 361, "flightMs": 0, "stancePct": 31, "flightPct": 19,
    "hsuGctMs": 326, "hsuFlightMs": 0, "hsuStancePct": 31, "diffMs": 0,
    "skipHsuCompare": true, "flightLabel": "雙腳支撐",                    // 只在行走分支出現
    "rating": "walking", "ratingText": "🚶 行走步態 (雙腳交替支撐 • 零騰空)",
    "ratingColor": "text-purple-300", "advice": "散步/健走步態，重心平穩轉換，無騰空衝擊。"
  }
}
```

| 欄位 | 型別 | 單位 | 說明 |
| ---- | ---- | ---- | ---- |
| `cadence` | number | 步/分鐘 | 輸入步頻 clamp 到 60–240 後的值（不一定等於頂層 `cadence`） |
| `stepMs`、`cycleMs` | number | ms | 單步、完整週期（兩步）時間，四捨五入 |
| `gctMs`、`flightMs` | number | ms | 與 `metrics.gctMs`／`flightMs` 相同 |
| `stancePct`、`flightPct` | number | 週期 % | 單腳支撐佔整個週期的比例；`flightPct = 50 − stancePct`。行走分支時 `flightPct` 是雙腳支撐的比例，不是騰空 |
| `hsuGctMs`、`hsuFlightMs`、`hsuStancePct` | number | ms／% | 徐國峰基準（單步 56%） |
| `diffMs` | number | ms | `gctMs − hsuGctMs`；行走與徐國峰基準分支固定 0 |
| `skipHsuCompare` | `true` | — | **只在行走分支出現**；表示不做徐國峰比對 |
| `flightLabel` | string | — | **只在行走分支出現**（`"雙腳支撐"`）；UI 以它取代「騰空 Nms」 |
| `rating` | `"walking" \| "elite" \| "good" \| "long" \| "excessive"` | — | 評級代碼 |
| `ratingText`、`advice` | string | — | 繁中顯示文字（含 emoji） |
| `ratingColor` | string | — | Tailwind 文字色 class |

- 內容 = `plain(computeGctMetrics(summary, cadence))`，**原樣輸出、不補欄位、不改名**：行走以外的分支不輸出 `skipHsuCompare`／`flightLabel`（Client 現行以 falsy 判斷，`undefined` 與缺欄位等價）。替代方案見第 14 節第 1 點。
- 1.0.0 的 `gctMs`、`flightMs` 保留（舊讀者相容），與 `gct` 內同名欄位必為同值（測試斷言）。
- MINOR 規則：只新增選填欄位。舊 Client（`analysisSchemaVersion` 1.0.0）匯入 1.1.0 檔：`validateAnalysisJSON` 只擋 MAJOR > 1，忽略未知欄位，可正常匯入（V 組測試）。1.0.0 檔與 legacy 檔沒有 `gct`，3.7 匯入時由 derive 補。
- 契約 §2.4「Client 匯入時忽略 `metrics`」在 3.6 仍成立；3.7 改寫。
- `ratingText`／`advice`／`ratingColor` 讓契約帶顯示文字與樣式 class（D5 的「完整物件」）。記錄為已知取捨（第 13 節），之後 React 化時可改由 Client 依 `rating` 對照。

### 6.2 `lib/server/metrics.js`

```js
import "server-only";
import * as core from "../core/index.js";
const plain = (v) => JSON.parse(JSON.stringify(v));

// /api/analyze 與 /api/derive 共用：契約 1.1.0 的 metrics（鍵順序固定）
export function buildMetrics(summary, cadence) {
  const gct = core.computeGctMetrics(summary, cadence);
  const isBiomechanicalRunner =
    summary.avgElbow != null && summary.avgElbow <= 100 && (summary.hipRomDeg || 38) >= 36;
  return {
    gctMs: gct.gctMs,
    flightMs: gct.flightMs,
    isWalking: cadence < 135 && !isBiomechanicalRunner,
    overallScore: core.calculateOverallRunningScore(summary, cadence),
    gct: plain(gct),
  };
}
```

- `isBiomechanicalRunner` 判斷從 `analyze.js:73–74` **逐字搬移**，不合併（D10）。
- `analyze.js` 改為 `metrics: buildMetrics(summary, cadence)`，刪除 `:68` 與 `:73–74` 的區域變數；`result` 其餘欄位、順序、`plain` 用法不動。
- `plain` 與 `analyze.js` 內的同名小函式重複一份（兩行），不抽共用檔，避免為兩行新增模組。

### 6.3 `POST /api/derive`

#### 請求

`Content-Type: application/json`（與 analyze 相同的嚴格比對）。

```jsonc
{
  "summary": {                     // 必填，物件
    "trunkAngle": 9.8, "comOffsetCm": 1.5, "touchdownKnee": 170, "minSwingKnee": 70,
    "pushOffExtensionDeg": 16.4, "avgElbow": 125, "footStrikeAngle": 2, "hipRomDeg": 62,
    "strideMeters": 0.36,
    "_measuredPixelStride": 0.36, "measuredStrideMeters": 0.36, "_autoDetectedStatic": true,
    "phaseTiming": { "touchPct": 0, "posePct": 15, "fallPct": 30, "pullPct": 84 }
  },
  "cadence": 103,                  // 必填
  "heightCm": 172,                 // 選填，預設 APP_CONFIG.defaults.heightCm（172）
  "cameraMode": "auto",            // 選填，預設 "auto"
  "includeKeyframes": false        // 選填，預設 false；true 時回傳 101 幀 cycleKeyframes
}
```

驗證規則（`validateDeriveRequest`，只檢查、不修正；錯誤訊息繁中，最多 20 條）：

| 欄位 | 規則 |
| ---- | ---- |
| body | JSON 物件（非 `null`、非陣列） |
| 頂層未知欄位 | 拒絕（400）：特別是 `frames`、`profileName`、`lm` 不得出現，避免 Client 誤送個資；理由見第 14 節第 4 點 |
| `cadence` | 必填，有限數字，`0 < cadence ≤ 400`（只擋非法值；契約 60–240 是產生端義務，舊檔可能超出，`computeGctMetrics` 自身會 clamp） |
| `heightCm` | 選填，有限數字 50–250（同 analyze 的 `LIMITS.heightCm`） |
| `cameraMode` | 選填，`"auto" \| "static" \| "tracking"` |
| `includeKeyframes` | 選填，boolean |
| `summary` | 必填，物件；**只接受下列鍵**，其他鍵拒絕（400） |
| `summary.trunkAngle`、`comOffsetCm`、`touchdownKnee`、`minSwingKnee`、`pushOffExtensionDeg`、`avgElbow`、`footStrikeAngle`、`hipRomDeg`、`strideMeters`、`_measuredPixelStride`、`measuredStrideMeters` | 選填；有限數字（絕對值 ≤ 1000）或 `null` |
| `summary._autoDetectedStatic` | 選填，boolean 或 `null` |
| `summary.phaseTiming` | 選填，物件或 `null`；只接受 `touchPct`、`posePct`、`fallPct`、`pullPct`，各為有限數字（0–100）或 `null` |

- 缺欄位維持「缺」（`undefined`），不補 `null`、不補預設值：核心的 `??` 預設值行為因此與瀏覽器本地呼叫相同。
- 不檢查 `summary` 欄位的語意範圍（例如膝角 0–180），與 `validateAnalysisJSON` 的態度一致；絕對值 1000 只是防呆。
- 大小上限：`DERIVE_LIMITS.maxBodyBytes = 16 * 1024`（16 KB；正常請求約 0.5 KB）。超過回 413，與 analyze 相同的串流計數與 `Content-Length` 提早拒絕。

#### 處理

```js
export function deriveRequest(body) {
  const check = validateDeriveRequest(body);
  if (!check.ok) return { ok: false, error: "invalid_request", details: check.details };
  const heightCm = body.heightCm ?? core.APP_CONFIG.defaults.heightCm;
  const cameraMode = body.cameraMode ?? core.APP_CONFIG.defaults.cameraMode;
  const summary = pickSummary(body.summary);      // 白名單複製，順序固定；不改寫 body
  const { cadence } = body;
  const stride = core.computeStrideForCameraMode(summary, cameraMode, heightCm, cadence);
  return { ok: true, result: {
    schemaVersion: core.APP_CONFIG.analysisSchemaVersion,
    version: core.APP_CONFIG.version,
    source: "server",
    cadence, heightCm, cameraMode,
    metrics: buildMetrics(summary, cadence),
    phaseTiming: core.computePersonalizedPhaseTiming(summary, cadence),
    stride: { strideMeters: stride.strideMeters, measuredStrideMeters: stride.measuredStrideMeters,
              pixelVal: stride.pixelVal, strideModeText: stride.strideModeText },
    autoStrideMeters: core.computeAutoStrideMeters(summary, heightCm, cadence),
    ...(body.includeKeyframes ? { cycleKeyframes: plain(core.buildCycleKeyframesFromSummary(summary, cadence, 100)) } : {}),
  } };
}
```

- 所有輸出都只依賴**送來的 summary**，彼此不連動：`computeGctMetrics`、`calculateOverallRunningScore`、`computePersonalizedPhaseTiming` 不讀 `strideMeters`，所以 `stride` 的結果不會回灌到 `metrics`。關鍵幀用送來的 `summary.strideMeters`（不是 `stride.strideMeters`），由 Client 決定送哪個值（3.7）。
- `metrics` 與 `/api/analyze` 同一個 `buildMetrics`。
- 沒有 `timestamp`：同一輸入的回應逐位元組相同，方便測試與快取判斷（但仍 `no-store`）。
- 不回傳 `summary`、不回傳任何請求欄位以外的使用者資料（只回 `cadence`、`heightCm`、`cameraMode` 供 Client 核對過時回應）。

#### 回應

200：

| 欄位 | 來源 | 3.7 的用途（參考） |
| ---- | ---- | ---- |
| `schemaVersion`、`version`、`source` | `APP_CONFIG`、`"server"` | 版本核對 |
| `cadence`、`heightCm`、`cameraMode` | 請求值（後兩者含預設） | 丟棄過時回應 |
| `metrics` | `buildMetrics`（第 6.2 節，含 `gct`） | 遙測、診斷、總分、GCT 色條、狀態牌、波形 |
| `phaseTiming` | `computePersonalizedPhaseTiming(summary, cadence)` | **只在匯入時採用**（取代 `buildSafeSummaryFromJSON` 的本地正規化）；其他情境不得寫回 summary，否則 `pullPct` 會再次漂移（第 2.4 節） |
| `stride` | `computeStrideForCameraMode(summary, cameraMode, heightCm, cadence)` 的 4 個欄位 | 機位切換、身高、重設自動、切換 profile、擷取完成 |
| `autoStrideMeters` | `computeAutoStrideMeters(summary, heightCm, cadence)` | 遙測非手動步幅（`measuredStrideMeters > 0 ? 它 : autoStrideMeters`，選擇規則留在 UI） |
| `cycleKeyframes` | `includeKeyframes: true` 時才有；`buildCycleKeyframesFromSummary(summary, cadence, 100)` | D7：舊格式／無關鍵幀／不合法關鍵幀匯入時補骨架 |

錯誤（body 與 analyze 同格式，白名單組裝）：

| 狀態 | 內容 | 時機 |
| ---- | ---- | ---- |
| 400 | `{ error: "invalid_request", details: [...] }` | 驗證失敗、body 非 JSON（含空 body） |
| 403 | `{ error: "forbidden" }` | 瀏覽器跨源（`checkAccess`，規則同 analyze） |
| 405 | — | 非 POST（Next 自動；`OPTIONS` 204） |
| 413 | `{ error: "payload_too_large" }` | body 超過 16 KB |
| 415 | `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }` | Content-Type 不符 |
| 429 | `{ error: "rate_limited" }`＋`Retry-After` | 超過每 IP 限流 |
| 500 | `{ error: "internal_error" }` | 非預期例外；只 log 固定字串 `derive failed` |

沒有 422（derive 不經擷取閘門）。所有回應帶 `RESPONSE_HEADERS` 5 個安全標頭，不帶 CORS。

#### 存取控制與限流

- 沿用 `lib/server/access-control.js` 的預設 `checkAccess`，**不改該模組**：Origin／`Sec-Fetch-Site` 規則完全相同。
- 限流：**與 `/api/analyze` 共用同一個每 IP 計數**（每 60 秒 30 次，兩個端點合計）。這是單一存取控制模組的自然結果；代價是 3.7 手動調整時會吃掉分析額度（第 15 節第 1 點）。
- 處理順序與 analyze 相同：存取控制（403 → 429，只看標頭、不讀 body）→ 415 → 串流讀 body（413）→ JSON（400）→ 驗證與計算（400／200）。

### 6.4 `lib/core/index.js` 新增 3 個名稱

```js
export {
  computeAutoStrideMeters,
  computeGctMetrics,
  computePersonalizedPhaseTiming,
  computeStrideForCameraMode,
  generatePoseMethodAlignedCycle,
} from "./biomechanics.js";
```

- 維持「`lib/server` 只經 `../core/index.js` 使用核心」的規則（替代方案見第 14 節第 3 點）。
- `tests/core-modules.test.js:21` 的「恰好 9 個名稱」改為 12 個，測試名稱同步更新；型別檢查（函式）自動涵蓋新名稱。
- 三個函式本體不動（`biomechanics.js` 不修改）。

### 6.5 `http-handler.js` 共用流程

```js
// key 須與 ANALYZE_ERRORS／DERIVE_ERRORS 完全一致
export const ERROR_STATUS = { invalid_request: 400, payload_too_large: 413, insufficient_frames: 422 };
export const DERIVE_ERROR_STATUS = { invalid_request: 400 };
// 唯一的 log 內容；固定字串，不帶錯誤物件
const FAIL_LOG = Object.freeze({ analyze: "analyze failed", derive: "derive failed" });

async function handleJsonPost(request, { run, maxBodyBytes, errorStatus, kind, checkAccess }) { … }

export function handleAnalyzeHttp(request, { analyze = analyzeRequest, checkAccess = defaultCheckAccess } = {}) {
  return handleJsonPost(request, { run: analyze, maxBodyBytes: LIMITS.maxBodyBytes, errorStatus: ERROR_STATUS, kind: "analyze", checkAccess });
}
export function handleDeriveHttp(request, { derive = deriveRequest, checkAccess = defaultCheckAccess } = {}) {
  return handleJsonPost(request, { run: derive, maxBodyBytes: DERIVE_LIMITS.maxBodyBytes, errorStatus: DERIVE_ERROR_STATUS, kind: "derive", checkAccess });
}
```

- `handleJsonPost` 是現在 `handleAnalyzeHttp` 本體的**機械式參數化**：`readLimitedText(request, maxBodyBytes)`、`ERROR_STATUS` → `errorStatus`、`console.error(FAIL_LOG[kind])`。錯誤白名單組裝（`invalid_request` 帶 `details`、`insufficient_frames` 帶 `acceptedFrames`、其他只帶 `error`）照舊。
- 全檔 `console.` 仍只出現一次。`handleAnalyzeHttp` 的參數、回傳、狀態碼、body、標頭、log 字串皆不變（既有 `api-analyze-route.test.js` 不改任何案例即全過）。
- `app/api/derive/route.js`：

  ```js
  import { handleDeriveHttp } from "../../../lib/server/http-handler.js";
  // 若日後啟用 Cache Components（cacheComponents），須移除此 runtime export。
  export const runtime = "nodejs";
  // HTTP 流程在 lib/server/http-handler.js；存取控制接入點在 lib/server/access-control.js。
  export async function POST(request) {
    return handleDeriveHttp(request);
  }
  ```

## 7. 零行為變更

### 7.1 `/api/analyze`

- 三份 landmarks 樣本的回應：除 `schemaVersion`（`"1.0.0"` → `"1.1.0"`）與新增的 `metrics.gct` 外，**全部欄位逐值相同**；`TOP_KEYS` 順序不變（`metrics` 內新增的 `gct` 在最後）。基準 193／176／150、總分 66／90／75、GCT 193／192／230 不變。
- `metrics.gct` `toStrictEqual(plain(computeGctMetrics(result.summary, result.cadence)))`，且 `gct.gctMs === metrics.gctMs`、`gct.flightMs === metrics.flightMs`。
- 模擬擷取快照（`tests/profiles-bake.test.js:136` P3）目前以 `toStrictEqual({ gctMs: 257, flightMs: 104, isWalking: false, overallScore: 35 })` 比對整個 `metrics`，1.1.0 後必失敗。改為：原有 4 個數值不變，另斷言 `metrics.gct` 等於 `plain(computeGctMetrics(summary, cadence))`；數值不得改變。

### 7.2 `/api/derive` 與 temp-core 逐值一致

對照來源：`public/legacy/temp-core/` 同名函式（＝`lib/core` 的逐字副本，`tests/legacy-client.test.js` C1 已把關）。測試直接用 `lib/core/index.js` 計算期望值；第 5 節步驟 1 另以 scratchpad 探針對 temp-core 擷取一次寫入 Notes。

| 輸入 | 期望（探針實測） |
| ---- | ---- |
| walk 樣本（`summary`＋頂層 `phaseTiming`、`cadence` 103、172、auto） | `metrics` `{ gctMs: 361, flightMs: 0, isWalking: false, overallScore: 96, gct: {…17 鍵, rating: "walking"} }`；`phaseTiming` `{0, 15, 30, 84}`；`stride` `{ strideMeters: 0.36, measuredStrideMeters: 0.36, pixelVal: 0.36, strideModeText: "📷 靜態機位像素測量" }`；`autoStrideMeters` 0.78 |
| 同上、`cameraMode: "static"` | `stride.strideModeText` `"📷 手動鎖定靜態機位"`，步幅 0.36 |
| 同上、`cameraMode: "tracking"` | `stride` `{ strideMeters: 0.78, measuredStrideMeters: null, pixelVal: 0.36, strideModeText: "🚶 手動鎖定跟拍(走路)" }` |
| `kf-walk-101`／`kf-hsu-101` 的 summary＋`phaseTiming`＋`cadence`，`includeKeyframes: true` | `JSON.stringify(cycleKeyframes)` 與樣本檔**逐字相同** |
| 三份 `client-*.json` 的 `summary`＋`cadence` | `metrics.gctMs`／`flightMs`／`overallScore` 等於樣本檔 `metrics`（193／118／66、192／149／90、230／170／75） |
| 三份 landmarks 的 `analyzeRequest` 結果（summary、cadence、heightCm、cameraMode） | `metrics` 與 analyze 回應的 `metrics` `toStrictEqual`；`includeKeyframes: true` 時 `cycleKeyframes` 與 analyze 回應逐字相同；`stride.strideMeters` 等於 `summary.strideMeters` |
| 三個內建 profile（`BUILTIN_PROFILES`） | `metrics`、`phaseTiming`、`stride`、`autoStrideMeters` 各與核心直接呼叫相同；`includeKeyframes: true` 時等於 `BAKED_CYCLE_KEYFRAMES` |
| 合成：`cadence` 120／134／135／170／200，`avgElbow` 90 與 125 交叉 | 行走／跑步／徐國峰三個分支都覆蓋；`metrics.isWalking` 與 `calculateOverallRunningScore` 的判斷一致 |

## 8. 契約版本與 `APP_CONFIG` 同步

| 位置 | 3.6 | 理由 |
| ---- | --- | ---- |
| `lib/config.js` `analysisSchemaVersion` | `"1.1.0"` | Server 產出的格式變了（`metrics.gct`） |
| `public/js/config.js` `analysisSchemaVersion` | 維持 `"1.0.0"`（建議預設，第 15 節第 2 點） | Client 匯出的檔案不含 `metrics`，標 1.0.0 才如實；Client 不動。3.7 讓匯出帶 `metrics` 時再升 |
| `APP_CONFIG.version` | 維持 `V3.29` | 非發版 |
| `tests/legacy-client.test.js` 版本把關 | 不改（只比 `version`） | — |
| `docs/analysis-json-contract.md` | 頂端「契約版本 1.1.0」、§2.4、§3、修訂紀錄 | — |

`lib/contract/validate-analysis-json.js` 不改：它只以 `analysisSchemaVersion` 的 MAJOR 判斷支援，1.0.0／1.1.0 都通過。

## 9. 測試計畫

**既有測試**：除第 4 節列出的期望值修改外全部照舊通過。`api-analyze-route.test.js` 既有案例**一個都不改**。

**A. `/api/analyze` 契約 1.1.0（`tests/baseline.test.js` 修改、`tests/validate-analysis-json.test.js` 新增）**

1. A1：三份 landmarks：`result.schemaVersion === APP_CONFIG.analysisSchemaVersion === "1.1.0"`；`validateAnalysisJSON(result)` 回 `{ ok: true, schemaVersion: "1.1.0", errors: [], warnings: [] }`。
2. A2：`metrics` 鍵依序為 `gctMs, flightMs, isWalking, overallScore, gct`；`metrics.gct` 等於 `plain(computeGctMetrics(summary, cadence))`；同名欄位同值。
3. A3：基準數值不變（現有斷言照舊）；`cycleKeyframes`、`summary`、`phaseTiming`、`strideMeters` 與修改前逐值相同（以「刪除 `schemaVersion` 與 `metrics.gct` 後」與步驟 1 存下的修改前結果 `toStrictEqual`，scratchpad 結果寫入 Notes；永久測試以現有逐值斷言把關）。
4. A4（validate）：`schemaVersion: "1.1.0"` 帶 `metrics.gct` → `ok`、零 warnings；`"1.9.0"` → `ok`；`"2.0.0"` → 不支援（現行規則不變）。

**R. `deriveRequest`（`tests/derive.test.js`，永遠執行，不需樣本）**

1. R1 驗證：body 非物件、缺 `summary`、缺 `cadence`、`cadence` 0／-1／401／`"180"`／`NaN`、`heightCm` 49／251、`cameraMode` `"x"`、`includeKeyframes` `"yes"`、summary 欄位為字串／`Infinity`／1001、`phaseTiming.pullPct` 101、summary 未知鍵、頂層 `frames`／`profileName`／未知鍵 → `invalid_request`，`details` 為字串陣列且 ≤ 20 條。
2. R2 預設值：省略 `heightCm`、`cameraMode` → 回應為 172、`"auto"`；`includeKeyframes` 省略或 `false` → 無 `cycleKeyframes` 鍵。
3. R3 `null` 與缺欄位：`summary` 全空 `{}` 與欄位皆 `null` 都回 `ok`；輸出等於以同一物件直接呼叫核心（`null` 原樣傳入，不被轉成缺欄位）。
4. R4 不改寫輸入：呼叫前後 `body` 深度相等（`structuredClone` 比對）。
5. R5 可重現：同一輸入兩次 `JSON.stringify` 相同；回應無 `timestamp`。
6. R6 分支覆蓋：第 7.2 節最後一列的合成輸入，`metrics.gct` 鍵集合符合第 2.3 節三個分支（行走 17 鍵、其餘 15 鍵）。
7. R7 不洩漏：回應鍵恰為 `schemaVersion, version, source, cadence, heightCm, cameraMode, metrics, phaseTiming, stride, autoStrideMeters`（＋選擇性 `cycleKeyframes`）；不含 `summary`。
8. R8 內建 profile：第 7.2 節「內建 profile」列。

**K. 基準逐值對照（`tests/derive.test.js`，`skipIf` 規則同 `baseline.test.js`；`REQUIRE_BASELINE=1` 時缺樣本直接失敗）**

1. K1 walk 樣本三種機位：第 7.2 節前三列全部 `toStrictEqual`（含 `gct` 全部 17 鍵的實際值與 `strideModeText` 字串）。
2. K2 `kf-walk-101`／`kf-hsu-101`：`includeKeyframes: true` 逐字相同。
3. K3 三份 `client-*.json`：`metrics` 三個數值等於樣本。
4. K4 三份 landmarks：derive（以 analyze 結果為輸入）與 analyze 的 `metrics`、`cycleKeyframes` 相同。

**H. HTTP（`tests/api-derive-route.test.js`，永遠執行）**

1. H1 route 模組：`runtime === "nodejs"`，export 只有 `POST`、`runtime`。
2. H2 200：同源（`Sec-Fetch-Site: same-origin`）合法請求 → 200、JSON body 等於 `deriveRequest` 結果、5 個安全標頭、無 `Access-Control-*`。
3. H3 Content-Type：缺／`text/plain`／`text/plain; x=application/json` → 415；`application/json; charset=utf-8` 不是 415。
4. H4 400：非法 JSON、空 body、BOM 開頭、`null`／`[]`／`"x"`／`{}`，以及 R1 的代表案例。
5. H5 413：`Content-Length` 超過 16 KB（不讀 body）；無 `Content-Length` 串流超過 16 KB（讀到上限後 cancel）；恰好 16 KB 不是 413。
6. H6 403：`Sec-Fetch-Site: cross-site`、Origin host 不符 → 403、不讀 body、不呼叫 derive。
7. H7 429 與共用計數：`resetAccessControlState()` 後，同一 IP 先打 analyze 15 次、derive 15 次都不是 429，第 31 次（不論哪個端點）→ 429＋`Retry-After`（第 15 節第 1 點若改為獨立計數，本案例改寫）。
8. H8 500：注入會丟例外的 `derive` → 500 `{ error: "internal_error" }`，不外洩 stack，`console.error` 恰被呼叫一次、參數只有 `"derive failed"`；注入回傳未知錯誤類型 → 500。
9. H9 `DERIVE_ERROR_STATUS` 的 key 與 `DERIVE_ERRORS` 完全一致（比照 analyze 的對應表測試）。

**S. 結構與隱私（修改 `core-modules.test.js`、`privacy-docs.test.js`）**

1. S1：`lib/core/index.js` 恰好 12 個名稱（第 6.4 節）。
2. S2：`app/api/*/route.js` 每支都只 import `../../../lib/server/http-handler.js`；`http-handler.js` 不出現 `request.text()`／`json()`／`arrayBuffer()`。
3. S3：新檔 `lib/server/{metrics,derive,validate-derive-request}.js` 第一行是 `import "server-only";`（現有 `it.each(serverFiles)` 自動涵蓋）；`derive.js`、`metrics.js` 只 import `server-only`、`../core/index.js` 與 `lib/server` 內檔案。
4. S4：`console.` 全專案（`app/`、`lib/`）仍只在 `http-handler.js` 出現一次；該檔含 `"analyze failed"` 與 `"derive failed"` 兩個字串常數。
5. S5：`privacy.md` 含 `analyze failed`、`derive failed`、`/api/derive`；`server-api.md` 含 `/api/derive`、`16 KB`。
6. S6：`public/**` 不含 `/api/derive`（3.6 Client 不呼叫；3.7 移除此斷言）。

## 10. 驗收標準

1. `REQUIRE_BASELINE=1 npm test` 全過：walk 103／361ms／96；`kf-walk-101`／`kf-hsu-101` 逐字相同；landmarks woman03 193／193ms／66、walkrun-a 176／192ms／90、walkrun-b 150／230ms／75；A、R、K、H、S 組全過。
2. `/api/analyze` 除 `schemaVersion` 與 `metrics.gct` 外逐值不變（A3 與 Notes 的修改前後比對）。
3. `/api/derive` 對第 7.2 節所有輸入與核心（＝temp-core）逐值相同，並以探針對 temp-core 實際擷取一次（Notes）。
4. 既有 `tests/api-analyze-route.test.js` 案例未修改即全過。
5. `git diff --stat -- public lib/player lib/landmarks lib/profiles lib/contract lib/core/biomechanics.js lib/core/cycle-analysis.js lib/core/keyframes-builder.js lib/server/access-control.js lib/server/validate-request.js app/api/analyze next.config.mjs scripts package.json` 為空。
6. `npm run sync:legacy`、`npm run bake:profiles` 執行後 `git status` 無差異；`VERCEL=1 npm run build` 仍失敗。
7. 文件依第 12 節更新，不宣稱尚未成立的保護（3.6 之後 UI 仍在瀏覽器算衍生值）。

## 11. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`（輸出的 route 清單出現 `ƒ /api/derive`）、`npm run lint`。
2. `REQUIRE_BASELINE=1 npm test`，記錄基準數值與測試數；另跑一次不帶變數的 `npm test`。
3. HTTP（`npm run dev`，`curl -i`）：
   - `POST /api/derive`，`Sec-Fetch-Site: same-origin`，walk 樣本 summary → 200，`metrics.gctMs` 361、`overallScore` 96，5 個安全標頭，無 CORS 標頭。
   - `includeKeyframes: true` → 200，`cycleKeyframes.frames` 101 幀。
   - `Sec-Fetch-Site: cross-site` → 403；`Content-Type: text/plain` → 415；17 KB body → 413；`{"cadence":180}` → 400；`GET /api/derive` → 405（帶 `Cache-Control: no-store`）；`OPTIONS` → 204。
   - 同一 IP（固定 `x-forwarded-for`）連打 analyze／derive 合計 31 次，第 31 次 429＋`Retry-After`（重啟 dev 或等 60 秒後再做其他檢查）。
   - `POST /api/analyze`（woman03 landmarks）→ 200，`schemaVersion` `"1.1.0"`、`metrics.gct.rating` `"good"`、步頻 193。
4. **bundle 檢查**（scratchpad 腳本）：`.next/static/` 搜尋 `derive failed`、`computeStrideForCameraMode`、`strideModeText`、`buildMetrics`、`validateDeriveRequest` 與 3.4 的 A2 字串，預期零命中（`public/` 內 temp-core 的既有命中照舊，與 3.5 Notes 對照）。
5. **Playwright（回歸；Client 未改）**：載入 `/index.html`，console 無 error（Tailwind CDN warning 允許）、無 404；切換 Profile、播放骨架動畫；無影片模擬擷取 → 恰好一個 `POST /api/analyze` 200，遙測步頻 166（回應 `schemaVersion` 1.1.0 不影響 UI）；選擇／拖入 `woman03 - Trim.mp4` 擷取 → 193；匯入 walk 樣本 → 103／361ms／96；網路紀錄中沒有 `/api/derive`。
6. 文件核對（第 12 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 12. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/analysis-json-contract.md` | 頂端「契約版本：`schemaVersion = "1.1.0"`」；§2.1 範例 `schemaVersion` 與 `metrics` 註解；§2.4 新增 `metrics.gct` 欄位表（第 6.1 節，含「`skipHsuCompare`／`flightLabel` 只在行走分支出現」「`cadence` 為 clamp 後值」「含顯示文字」）；註明 Client 3.7 前仍忽略 `metrics`；§3 補「1.1.0：新增 `metrics.gct`」；§5 範例改 1.1.0；修訂紀錄新增 3.6 一條（MINOR，新增選填欄位，舊檔照常匯入） |
| `docs/server-api.md` | 標題改為「Server API」；架構段加入 `app/api/derive/route.js`、`derive.js`、`validate-derive-request.js`、`metrics.js`；新增「`POST /api/derive`」章節（請求、驗證表、回應欄位、錯誤表、16 KB 上限、無 422）；限流段註明「`/api/analyze` 與 `/api/derive` 共用每 IP 計數」；`/api/analyze` 回應改為契約 1.1.0；開頭警語補「3.6 起提供 `/api/derive`，Client 於 3.7 才呼叫」 |
| `docs/privacy.md` | 第 1／2 節：新增 derive 端點（3.6 起存在，3.7 起 Client 才使用）；第 3 節新增 derive 上傳欄位表（`summary` 數值、`cadence`、`heightCm`、`cameraMode`、`includeKeyframes`；無 landmarks、無檔名、無 `profileName`，頂層未知欄位會被拒絕），帶回欄位只有 `cadence`、`heightCm`、`cameraMode`；第 4 節「回應只含衍生結果」涵蓋 derive；第 5 節 log 改為兩個固定字串；第 6 節限流共用；第 10 節「新增重算端點」改為已發生 |
| `docs/client-server-boundary.md` | 頂端狀態：契約 1.1.0 與 `POST /api/derive` 已於 3.6 建立（Server 端），Client 改讀為 3.7；第 4 章總表 `computePersonalizedPhaseTiming`、`computeAutoStrideMeters`、`computeStrideForCameraMode` 的「呼叫端」補 `lib/server/derive.js`；第 5 章 D5、D6「影響」欄註記「3.6 已落實 Server 端」，D6 記錄最終請求／回應欄位與共用限流；第 6 章三列更新；第 8 章補 3.6 一段（含給 3.7 的交接：`phaseTiming` 只在匯入時採用、`NaN`→`null` 差異、`applyCapturedResult` 的 cadence 來源） |
| `docs/planning/epics-and-features.md` | 3.6 改為 `done`，一句結論＋連到本規格；3.7 說明補「debounce、`includeKeyframes` 補舊檔骨架、`public/js/config.js` 升 1.1.0」 |
| `README.md` | 目前狀態：3.6 完成；API 清單加 `/api/derive`（Client 尚未呼叫）；仍不可部署 |
| `AGENTS.md` | 不改 |

## 13. 風險與已知限制

- **評分 oracle**（決策文件第 6 章）：derive 不需 MediaPipe，任何人可用任意 summary 反覆查詢評分、GCT 與步幅公式，比 analyze 更容易偽造輸入。現階段以 Client 表現優先（使用者決定），限流僅盡力而為；如實寫入 `server-api.md`、`privacy.md`。
- **共用限流額度**：3.7 的手動步頻、身高、機位調整都會呼叫 derive，與分析共用每 IP 30 次／60 秒。即使 debounce，密集調整後可能讓下一次影片分析 429（第 15 節第 1 點）。
- **契約帶顯示文字**：`ratingText`、`advice`、`ratingColor`（Tailwind class）進入契約後，改文案或配色即屬契約內容變更；之後若要去除，屬 MAJOR 或須保留欄位。
- **`phaseTiming` 不冪等**：derive 照實輸出 `computePersonalizedPhaseTiming` 的結果。3.7 若把它寫回 summary 再送，`pullPct < 68` 的檔案會再度漂移；規格在第 6.3 節與 `server-api.md` 明定「只在匯入時採用」，3.7 須以測試把關。
- **`NaN` 與 `null`**：Client 本地呼叫時是 `NaN`，經 JSON 後 Server 看到 `null` 而走 `??` 預設值，壞資料匯入檔的數值可能與現在不同。只影響含非數字欄位的匯入檔，3.7 驗收時記錄。
- **匯入 `phaseTiming` 的邊界差異**：`buildSafeSummaryFromJSON` 在 `phaseTiming` 存在但 `posePct` 非數字時，只傳 `{ phaseTiming }` 給公式（其他欄位用預設），derive 則用整份 summary。3.7 若要逐值重現，須在 Client 處理這個分支或接受差異。
- **`applyCapturedResult` 的步頻來源**：`recalculateStrideForCameraMode` 讀的是**切換前**作用中 profile 的 `cadence`（`index.html:1355`），不是剛擷取的步頻。這是既有行為，3.6 不處理；3.7 改用 derive 時須決定要不要沿用。
- **`lib/core` 公開面擴大**：入口由 9 個變 12 個；仍是 server-only，不影響瀏覽器 bundle。
- **仍不可部署**：temp-core 仍在，3.6 完成不代表可以進 4.1。

## 14. 待決定（start 時先採預設）

1. **`metrics.gct` 形狀**：原樣輸出 `computeGctMetrics` 回傳值（**建議**，行走以外不含 `skipHsuCompare`／`flightLabel`）／一律輸出 17 鍵（非行走補 `false`／`null`，對讀者較友善，但與核心回傳值不再逐值相同）。
2. **derive 回應是否帶 `cycleKeyframes`**：`includeKeyframes` 旗標、預設不帶（**建議**；每次約 34 KB，只有匯入補骨架需要）／一律帶（D6 原文「＋關鍵幀」，但每次手動調整都多 34 KB）／另開端點。
3. **derive 取用核心的方式**：`lib/core/index.js` 擴充為 12 個名稱（**建議**，維持單一入口）／`derive.js` 直接 import `../core/biomechanics.js`（違反現行規則）。
4. **頂層未知欄位**：拒絕 400（**建議**，防止 Client 誤送 `frames`／`profileName`，privacy 文件可明確承諾）／忽略（與契約「忽略未知欄位」一致，較寬鬆）。
5. **`cadence` 驗證範圍**：`0 < cadence ≤ 400`（**建議**，只擋非法值、不擋舊檔）／60–240（契約產生端範圍，可能讓舊檔匯入在 3.7 失敗）。
6. **body 上限**：16 KB（**建議**）／沿用 4 MB。
7. **共用 HTTP 流程**：抽出 `handleJsonPost`（**建議**）／`handleDeriveHttp` 複製一份流程（重複、日後易漂移）。

## 15. 未決事項（不阻擋開工，需要使用者回答）

1. **`/api/derive` 是否與 `/api/analyze` 共用限流額度？**
   - **建議預設：共用**（每 IP 每 60 秒合計 30 次）。不動 `access-control.js`，存取控制維持單一實例；3.7 以 debounce 降低呼叫次數。
   - 替代：derive 另用一個 `createAccessControl` 實例（例如 60 次／60 秒），分析額度不受手動調整影響；代價是 `access-control.js` 須匯出第二個實例、文件與測試多一組數值，IP 會存在兩個 `Map`（privacy 文件須同步）。
2. **`public/js/config.js` 的 `analysisSchemaVersion` 何時升為 `1.1.0`？**
   - **建議預設：3.7**。3.6 只動 Server，Client 匯出的檔案沒有 `metrics`，標 `1.0.0` 才如實；3.7 讓 Client 讀寫 `metrics.gct` 時一起升。期間 `lib/config.js`（1.1.0）與 `public/js/config.js`（1.0.0）刻意不同，在兩處註解與 Notes 記錄。
   - 替代：3.6 一起改這一行（兩份 `APP_CONFIG` 保持一致，符合 AGENTS「兩份同步」的精神），但等於修改 Client，且 Client 會把不含 `gct` 的檔案標成 1.1.0（MINOR 只是選填，格式上仍合法）。
