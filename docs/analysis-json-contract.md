# 分析結果 JSON 契約（Analysis Result JSON Contract）

> 源自舊專案 `D:\MyWeb\Running form analyzer` 的 `docs/analysis-json-contract.md`，自 Feature 1.2 起成為本專案的契約正本。
> 本專案的產生端是 `lib/server/analyze.js`（`analyzeRequest`），驗證函式是 `lib/contract/validate-analysis-json.js`（`validateAnalysisJSON`，非 server-only，可在瀏覽器使用）。
> 第 1 節「現況盤點」描述的是舊 Client（`js/analyzer.js` 等），本專案的 Client 於 Epic 3 搬入後再更新。
> 契約版本：`schemaVersion = "1.0.0"`（已定版）。

本文件定義 Client 與（未來的）Server 之間交換「單支影片分析結果」的 JSON 格式，也是 Client「匯出／匯入 JSON」的檔案格式。

---

## 1. 現況盤點（導入 `schemaVersion` 前）

來源：`js/analyzer.js` 的 `exportAnalysisJSON()`、`importAnalysisJSON()`、`buildSafeSummaryFromJSON()`。

### 1.1 匯出欄位

| 欄位 | 型別 | 來源 | 匯入時是否讀取 |
| ---- | ---- | ---- | -------------- |
| `version` | string | `APP_CONFIG.version`（程式版本，非格式版本） | 否 |
| `timestamp` | string | `new Date().toISOString()` | 否 |
| `profileKey` | string | `activeProfileKey` | 否 |
| `profileName` | string | `profile.name`（上傳影片時含檔名） | 否（3.1 報告會讀） |
| `cameraMode` | `"auto" \| "static" \| "tracking"` | `selectedCameraMode` | 是 |
| `heightCm` | number | `#runnerHeightInput`，預設 172 | 是（有值才套用） |
| `cadence` | number | `profile.cadence` | 是（沒有時用 180） |
| `strideMeters` | number | `profile.summary.strideMeters` | 是（優先於 `summary.strideMeters`） |
| `isManualStride` | boolean | 全域 `isManualStride` | 是 |
| `phaseTiming` | object | `profile.summary.phaseTiming`（3.5 起唯讀） | 是（優先於 `summary.phaseTiming`） |
| `summary` | object | `profile.summary` | 是（**唯一必填**，缺少即 alert） |

### 1.2 `summary` 欄位與匯入預設值

| 欄位 | 單位 | 匯入預設值 | 說明 |
| ---- | ---- | ---------- | ---- |
| `trunkAngle` | 度 | 7.4 | 軀幹前傾角（前傾為正） |
| `comOffsetCm` | cm | 3.0 | 觸地瞬間腳與重心水平距離 |
| `touchdownKnee` | 度（內角，180 = 伸直） | 155 | 觸地膝角 |
| `minSwingKnee` | 度（內角） | 74 | 擺盪期最小膝角 |
| `pushOffExtensionDeg` | 度 | 14.5 | 後蹬伸展角 |
| `avgElbow` | 度（內角） | 84 | 手肘角中位數 |
| `footStrikeAngle` | 度 | 2 | 著地角 |
| `hipRomDeg` | 度 | 38 | 髖關節前後擺幅 |
| `strideMeters` | m | 0.95 | `data.strideMeters ?? summary.strideMeters ?? 0.95` |
| `_measuredPixelStride` | m（名稱含 pixel，實為公尺） | null | 與 `measuredStrideMeters` 互為備援 |
| `measuredStrideMeters` | m | null | 靜態機位測得步幅 |
| `_autoDetectedStatic` | boolean | 依 `cameraMode` 等推定 | 是否自動判定靜態機位 |
| `phaseTiming` | object | 由 `computePersonalizedPhaseTiming` 推算 | 見 1.3 |

### 1.3 `phaseTiming`

`{ touchPct, posePct, fallPct, pullPct }`，週期百分比（0–100）。匯入時經 `computePersonalizedPhaseTiming` 正規化：`touchPct` 無值為 0；`pullPct` 無值為 75，小於 68 時改為 `min(85, pullPct + 20)`；頂層與 `summary` 皆無時由 `comOffsetCm`、`trunkAngle`、`minSwingKnee`、`cadence` 推算。

### 1.4 不在 JSON 內、由 Client 即時推算

- 觸地時間 GCT、騰空時間／雙腳支撐：`computeGctMetrics(summary, cadence)`。
- 綜合總分與 7 大指標：`calculateOverallRunningScore(summary, cadence)`。
- 動畫骨架：預設以 `generatePoseMethodAlignedCycle(p, summary, cadence)` 每幀即時解算；2.2 起若 JSON 帶合法 `cycleKeyframes`，改由關鍵幀線性內插（見 2.5）。`customCycleFrames` 只在記憶體。
- 行走判定：`cadence < 135`。

**結論**：匯入後的步頻、觸地時間、總分完全由 `cadence` + `summary`（+ `phaseTiming`）決定。

---

## 2. 契約 v1.0.0

### 2.1 頂層結構

```jsonc
{
  "schemaVersion": "1.0.0",        // 必填（v1 起）；格式版本，semver
  "version": "V3.29",              // 選填；產生端程式版本
  "source": "client",              // 選填；"client" | "server"
  "timestamp": "2026-11-11T08:00:00.000Z",
  "profileKey": "custom_captured",
  "profileName": "🎥 影片: xxx.mp4", // 可能含個人資訊
  "cameraMode": "auto",
  "heightCm": 172,
  "cadence": 180,                  // 必填；步/分鐘（雙腳合計）
  "strideMeters": 0.95,
  "isManualStride": false,
  "phaseTiming": { },
  "summary": { },                  // 必填
  "metrics": { },                  // 預留，Client 忽略
  "cycleKeyframes": { }            // 選填；2.2 起 Client 讀取，缺少或不合法時不顯示骨架並提示（3.5 起無本地運動學退回）
}
```

### 2.2 必填／選填（產生端義務）

| 欄位 | 必填 | 值域 | 單位 |
| ---- | ---- | ---- | ---- |
| `schemaVersion` | 是 | `"MAJOR.MINOR.PATCH"` | — |
| `cadence` | 是 | 60–240 | 步/分鐘 |
| `summary` | 是 | object | — |
| `summary.trunkAngle` | 是 | number | 度 |
| `summary.comOffsetCm` | 是 | number | cm |
| `summary.touchdownKnee` | 是 | 0–180 | 度（內角） |
| `summary.minSwingKnee` | 是 | 0–180 | 度（內角） |
| `summary.pushOffExtensionDeg` | 是 | number | 度 |
| `summary.avgElbow` | 是 | 0–180 | 度（內角） |
| `summary.hipRomDeg` | 是 | number | 度 |
| `summary.strideMeters` | 是 | > 0 | m |
| 其餘 `summary` 欄位 | 選 | 同 1.2 | — |

匯入端仍沿用 1.2 預設值，不因 `summary` 子欄位缺漏而拒絕匯入（見第 4 節）。上表「值域」是產生端的義務，Client 的 `validateAnalysisJSON` 只檢查型別（number），不檢查值域。JSON 根節點若不是物件（例如陣列），視為格式錯誤，與 MAJOR > 1 同樣 alert 並中止。

### 2.3 `phaseTiming`

`{ "touchPct": 0, "posePct": 15, "fallPct": 30, "pullPct": 75 }`，單位為週期百分比，需 `touchPct ≤ posePct ≤ fallPct ≤ pullPct`。產生端輸出已正規化值。

### 2.4 `metrics`

```jsonc
{ "gctMs": 210, "flightMs": 123, "isWalking": false, "overallScore": 82, "indicatorScores": { } }
```

Client 匯入時忽略，仍以 `summary` + `cadence` 即時推算。2.3 起 Server 輸出下列欄位（`indicatorScores` 尚未輸出）：

| 欄位 | 來源 |
| ---- | ---- |
| `gctMs`、`flightMs` | `computeGctMetrics(summary, cadence)` |
| `overallScore` | `calculateOverallRunningScore(summary, cadence)` |
| `isWalking` | `cadence < 135 && !isBiomechanicalRunner`（`avgElbow ≤ 100` 且 `hipRomDeg ≥ 36` 為跑者），與評分、骨架模型一致 |

注意：`computeGctMetrics` 的行走分支只看 `cadence < 135`，所以步頻 < 135 但被判為跑者時，`isWalking` 為 `false`，`gctMs` 仍用行走公式、`flightMs` 為 0（既有行為，照實輸出）。

### 2.5 `cycleKeyframes`

由 Server 一次產出整個週期已解算的骨架關鍵幀，Client 只做簡單內插。2.2 起 Client 會讀取並驗證（`normalizeCycleKeyframes`）；`metrics` 仍忽略。

```jsonc
{
  "cycleKeyframes": {
    "model": "angles-sagittal-v1",
    "phaseBasis": "animationCycle",
    "interpolation": "linear",
    "frames": [
      { "p": 0.0, "trunk": 8.7,
        "rThigh": -10.0, "rKnee": 63.0, "rAnkle": 6.0, "rIsStance": false,
        "lThigh": 18.2, "lKnee": 30.1, "lAnkle": 0.0, "lIsStance": true,
        "rShoulder": 20.0, "rElbow": 96.0, "lShoulder": -26.0, "lElbow": 96.0,
        "comOffset": 3.2 }
    ]
  }
}
```

關鍵幀存**關節角度**而非像素座標，結構同 `generatePoseMethodAlignedCycle()` 回傳（不含 `phaseTiming`）。

| 欄位 | 單位 | 定義 |
| ---- | ---- | ---- |
| `p` | 0–1 | 動畫週期相位，`p = cyclePct / 100`，與 `phaseTiming` 共用同一條時間軸（`phaseTiming` 百分比 ÷ 100 即事件所在的 `p`）；`phaseTiming` 只是四個事件點，關鍵幀是整個週期的取樣 |
| `trunk` | 度 | 軀幹相對鉛直前傾角，朝前進方向為正 |
| `rThigh`／`lThigh` | 度 | 大腿相對鉛直，向前為正 |
| `rKnee`／`lKnee` | 度 | **屈曲角**（0 = 伸直），與 `summary` 內角（180 = 伸直）相反 |
| `rAnkle`／`lAnkle` | 度 | **不是解剖學踝關節角**，而是足部方向修正量。足部全域角（從鉛直向下起算、朝前進方向為正）= `82 + clamp(−25, 35, 0.25 × (thigh − kneeFlex) + ankle)`，`kneeFlex` 先 clamp 到 `[4, 125]`。正值腳尖上抬（背屈方向），負值腳尖下壓（蹠屈方向），`0` 不代表中立位（依據 `solveKinematics` 的 `computeLegRelative`） |
| `rShoulder`／`lShoulder` | 度 | 上臂全域角 = `shoulder − trunk`（相對鉛直，向前為正） |
| `rElbow`／`lElbow` | 度 | 手肘屈曲角（0 = 伸直）；前臂全域角 = `shoulder − trunk + elbowFlex`，渲染時 `elbowFlex` clamp 到 `[25, 135]` |
| `rIsStance`／`lIsStance` | boolean | 是否支撐期；Client 只看此欄位，不從 `p` 推斷觸地腳 |
| `comOffset` | cm | 同 `summary.comOffsetCm` |

座標系：側面矢狀面、右腿為主角；「向前為正」相對前進方向（由渲染端 `dir` 決定）。關鍵幀一律存**未 clamp 的原始值**，clamp 由渲染端負責。

觸地腳依模型而定：

- 跑步模型：`p = 0` 左腳觸地（左腳支撐 `0 ≤ p < 0.22`），`p = 0.5` 右腳觸地（右腳支撐 `0.5 ≤ p < 0.72`）。
- 行走模型（`cadence < 135` 且非 `isBiomechanicalRunner`）：`p = 0` 右腳跟著地（右腳支撐 `0 ≤ p < 0.6`），`p = 0.5` 左腳跟著地；`0–0.1`、`0.5–0.6` 為雙腳支撐。

取樣與內插：

1. `frames` 依 `p` 嚴格遞增，首幀 `p = 0`、末幀 `p = 1` 且內容**直接複製首幀**（不可另外解算；行走模型 p=1 解算出的 `rIsStance` 會與 p=0 不同）；至少 21 幀，**建議 101 幀等距（`p = i / 100`）**。跑步模型支撐邊界 0.22／0.72 不在 1/20、1/40 格點上，41 幀會讓 `*IsStance` 錯位、髖部高度跳動。
2. 任意 `p` 先取 `p mod 1`，找相鄰兩幀 a、b，`t = (p − a.p) / (b.p − a.p)`：數值欄位線性內插；`*IsStance` 取 a 的值。
3. 產生端義務：每條腿 `*IsStance` 的切換點必須剛好落在關鍵幀上；可加入觸地／離地瞬間的非等距關鍵幀。
4. 缺少或不合法時，Client 不顯示骨架並提示（3.5 起，D2）；不合法時 `console.warn`，不 alert。
5. 帶關鍵幀的 Profile 以關鍵幀為準（視為 Server 的權威結果），Client 不因改步幅、身高而重算骨架。匯出時只在該 Profile 本來就有關鍵幀時才原樣帶出。

---

## 3. 版本規則

- `schemaVersion` 採 semver：PATCH 只修文件；MINOR 新增選填欄位（舊 Client 忽略未知欄位）；MAJOR 移除／改名／改單位語意（舊 Client 必須拒絕）。
- 與程式版本 `version` 各自獨立；Client 支援版本定義於 `APP_CONFIG.analysisSchemaVersion`。
- 匯入端一律忽略未知欄位。

## 4. 向下相容策略

| 情境 | 判定 | 匯入行為 |
| ---- | ---- | -------- |
| 無 `schemaVersion` | legacy | 照現行流程匯入，**不新增警告或阻擋** |
| MAJOR = 1 | 支援 | 檢查必填；缺欄位用 1.2 預設補上並 `console.warn`，不 alert |
| MAJOR > 1 或格式錯誤 | 不支援 | alert「此 JSON 版本較新或格式不符，請更新系統」，中止、不改狀態 |
| 缺 `summary` | 不合法 | 維持現行 alert「此 JSON 檔案缺少 summary 跑姿數據欄位」 |

欄位優先順序不變；匯出只新增 `schemaVersion`，所以新檔案舊版 Client 也能匯入。

## 修訂紀錄

- 1.2：契約搬入本專案；產生端改為 `lib/server/analyze.js`，驗證函式搬入 `lib/contract/`。屬於搬遷，沒有新增、移除或改名欄位，`schemaVersion` 維持 `1.0.0`。

- 2.3：Server 原型開始產出本契約（`source: "server"`、`metrics` 四個欄位、101 幀 `cycleKeyframes`），請求格式見 [server-api.md](server-api.md)。屬於語意澄清，沒有新增或改名欄位，`schemaVersion` 維持 `1.0.0`。

- 2.2：補充 `p`、`rAnkle`、肩／肘幾何語意、末幀複製、支撐切換點與 101 幀建議；Client 開始讀取 `cycleKeyframes`。屬於語意澄清（尚無任何產生端），沒有新增或改名欄位，`schemaVersion` 維持 `1.0.0`。更正 2.1 的說法：`p` 與 `phaseTiming` 是同一條軸，「右腳約在 p=0.5 觸地」只適用跑步模型。

## 5. 範例

```json
{
  "schemaVersion": "1.0.0",
  "version": "V3.29",
  "timestamp": "2026-11-11T08:00:00.000Z",
  "cameraMode": "auto",
  "heightCm": 172,
  "cadence": 103,
  "strideMeters": 0.36,
  "isManualStride": false,
  "phaseTiming": { "touchPct": 0, "posePct": 15, "fallPct": 30, "pullPct": 84 },
  "summary": {
    "trunkAngle": 9.8, "comOffsetCm": 1.5, "touchdownKnee": 170, "minSwingKnee": 70,
    "pushOffExtensionDeg": 16.4, "avgElbow": 125, "footStrikeAngle": 2, "hipRomDeg": 62,
    "strideMeters": 0.36, "measuredStrideMeters": 0.36, "_autoDetectedStatic": true
  }
}
```
