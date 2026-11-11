# Feature 3.1 — 盤點 Client 對本地解算的依賴

## Status

`done`

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

舊專案的 Client（`index.html`＋`js/*.js` 全域 script）在瀏覽器內直接執行整套核心（`biomechanics.js`、`keyframes.js`、`landmark-extract.js`、`cycle-analysis.js`，即舊 Server 以 `node:vm` 載入的同一批檔案）。本專案的核心已是 server-only（`lib/core/`），3.3 要「移除本地解算」，但舊 Client 有許多地方**不經過分析流程**也會呼叫核心：手動改步幅／身高／步頻／機位後重算、匯入 JSON、關鍵幀缺少時的退回、每個動畫影格的骨架解算、播放取樣與 profile 計時。

本 Feature 是**調查，不改程式**。產出：

1. **決策文件 `docs/client-server-boundary.md`**（新增，由實作者在 start 時依本規格的盤點撰寫）：每個 Client 依賴點在 3.3 之後的去向、每個核心函式的歸屬（server-only／瀏覽器可用模組／由 API 提供／刪除），以及第 4 節列出的決策與理由。
2. **決策結果寫回路線圖** `docs/planning/epics-and-features.md`：3.1 狀態、3.2／3.3 說明、「待處理」中相關兩條改為已決定並連到決策文件；需要時新增 Feature 列（例如契約 MINOR 升版、新 API）。
3. 視需要在 `docs/analysis-json-contract.md` 加一段「待 3.3 變更」的註記（只記錄方向，不改契約內容、不升 `schemaVersion`）。

**行為零變更**：不修改 `lib/`、`app/`、`tests/`、`package.json`、`next.config.mjs`，不新增依賴。基準 walk 103／361ms／96、三份 landmarks 193／176／150 照舊通過。

## 現況盤點（舊 Client 對核心的依賴）

以下為撰寫本規格時對舊專案的唯讀 grep 結果，**盤點基準：舊專案 commit `e29766d`**（工作區乾淨）。行號以此 commit 為準；舊專案原樣保留，行號不應變動。實作時若發現不符，以實際檔案為準並修正文件。

「核心函式」指舊專案 `js/biomechanics.js`、`keyframes.js`、`landmark-extract.js`、`cycle-analysis.js` 的頂層宣告與 `config.js` 的 `RUNNER_PROFILES`。路徑皆相對舊專案根目錄。

### (1) 手動改步幅／身高／步頻／機位後重算

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後的初步建議 |
| ---- | -------------- | ---- | ------------------ |
| `index.html:1337–1347` `onCameraModeChange`（觸發：`index.html:393`） | → `recalculateStrideForCameraMode` | 分析後切換機位模式，重算步幅與配速、重畫 | 經 D6 的重算 API 取得新步幅；不在瀏覽器解算 |
| `index.html:1350–1382` `recalculateStrideForCameraMode` | `computeStrideForCameraMode`（1357） | 依機位、身高、步頻決定步幅；**直接改寫** `s.strideMeters`／`measuredStrideMeters`／`_measuredPixelStride` | 改為套用 API 回傳值；不改寫 summary 的其他欄位 |
| `index.html:1385–1398` `onManualStrideInput`（`index.html:145`、`302`） | `parseManualStrideValue`（1386） | 手動步幅；寫入 `summary.strideMeters`（1390）後重畫。無關鍵幀的 profile 骨架也會變（`js/biomechanics.js:288` `strideBonusDeg`） | 純 Client：配速 = 步頻 × 步幅（本地四則運算）；`parseManualStrideValue` 是輸入解析，可放 UI 模組；骨架以關鍵幀為準不重算（契約 2.5 第 5 點） |
| `index.html:1400–1409` `resetStrideToAuto`（`index.html:151`、`308`） | → `recalculateStrideForCameraMode` | 改回自動步幅 | 同機位切換（D6） |
| `index.html:1411–1421` `onHeightInputChange`（`index.html:128`） | → `recalculateStrideForCameraMode`（非手動步幅時） | 改身高後重算自動步幅。**只重算步幅，不重新擷取角度**（雖然擷取時 `extractAnglesFromLandmarks` 也用到身高，`js/landmark-extract.js:115`） | 同 D6；維持舊行為「只重算步幅」 |
| `index.html:1423–1429` `onManualCadenceInput`（`index.html:267`，`oninput`） | 間接：`updateTelemetryAndDiagnostics` | 手動步頻；改寫 `profile.cadence` → 計時、GCT、總分重算；無關鍵幀時骨架也變 | 同 D6；`oninput` 每個按鍵都觸發，改打 API 須 debounce（限流 30 次／60 秒） |
| `index.html:1549–1628` `updateTelemetryAndDiagnostics` | `computePersonalizedPhaseTiming`（1554，**改寫** `s.phaseTiming`）、`computeGctMetrics`（1556）、`computeAutoStrideMeters`（1576）、`calculateOverallRunningScore`（1628） | 所有遙測、診斷卡、總分的計算中心；切換 profile、匯入、輸入變更時呼叫 | 只讀 profile 上已有的衍生結果（D5）；本函式不再呼叫核心 |
| `index.html:1509–1513` `updatePhaseTimingUI` | `computeGctMetrics`（未傳入時的備援） | GCT 色條、徐國峰比對 | 同上 |
| `js/ui.js:179–198` `switchProfile` | → `recalculateStrideForCameraMode`（187）、`getActiveRunnerTiming`（192） | 切換 profile 時重算步幅、跳到 Pose 相位 | 切換時只讀衍生結果；不重算 |
| `js/analyzer.js:172` `finalizeCycleExtraction` | → `recalculateStrideForCameraMode` | 擷取完成後依機位決定步幅 | Server 已在 `analyzeCapturedFrames` 內決定步幅（`lib/server/analyze.js:81`），Client 直接採用 |

### (2) JSON 匯入與驗證（含舊格式）

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後的初步建議 |
| ---- | -------------- | ---- | ------------------ |
| `js/analyzer.js:240–294` `validateAnalysisJSON` | `APP_CONFIG`（265） | 契約版本檢查；legacy 判定 | **已可在瀏覽器使用**：本專案 `lib/contract/validate-analysis-json.js:5`（非 server-only）；3.2／3.3 改 import 它 |
| `js/analyzer.js:190–237` `buildSafeSummaryFromJSON` | `computePersonalizedPhaseTiming`（225、230） | 補預設值、正規化 `phaseTiming` | 預設值補齊留在 Client（純資料）；`phaseTiming` 正規化改由 D6／D7 的 API 回傳 |
| `js/analyzer.js:296–435` `importAnalysisJSON`（`index.html:180`） | `RUNNER_PROFILES`（330 新增動態 key）、`evaluateProfileAngles`（342，`evalCycle`）、`normalizeCycleKeyframes`（348）、→ `switchProfile`（410）、→ `updateTelemetryAndDiagnostics`（424） | 建立 `json_<時間>` profile；合法關鍵幀掛上、不合法退回本地運動學 | 見 D7：`normalizeCycleKeyframes` 移到瀏覽器模組；缺／不合法關鍵幀與 legacy 檔的衍生值改由 API 補 |
| `js/analyzer.js:437–466` `exportAnalysisJSON`（`index.html:210`） | `getActiveRunnerTiming`（453）、`APP_CONFIG`（443–444） | 匯出契約 JSON；有關鍵幀才帶出（456） | `phaseTiming` 改讀 profile 上的值；其餘不變 |

### (3) 關鍵幀缺少時的退回路徑

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後的初步建議 |
| ---- | -------------- | ---- | ------------------ |
| `js/keyframes.js:97–102` `evaluateProfileAngles` | `sampleCycleKeyframes`（99）或 **`generatePoseMethodAlignedCycle`（101，退回）** | 渲染層取骨架角度的單一入口 | 拆成瀏覽器版「只有關鍵幀」的取樣（D1、D2）；退回分支刪除 |
| `js/config.js:66–68`、`92–94`、`119–121` 三個內建 profile 的 `evalCycle` | `evaluateProfileAngles` | 內建 profile **都沒有** `cycleKeyframes`，因此**永遠走退回路徑** | 內建 profile 改帶預先烘焙的 101 幀關鍵幀（D3） |
| `js/analyzer.js:341–343`、`346–360` 匯入 profile | `evaluateProfileAngles`、`normalizeCycleKeyframes` | 關鍵幀不合法時 `console.warn` 並退回本地運動學 | 見 D7 |
| `js/biomechanics.js:387–399` `evaluateProfileCycle` | `generatePoseMethodAlignedCycle`、`RUNNER_PROFILES.hsu_pose_method` | **不看關鍵幀**，一律本地解算 | 刪除（D4） |
| `index.html:2059–2064` `startSimulatedVideoFeed` 內 `renderSimVideo` | `evaluateProfileCycle`（2063）、`solveKinematics`（2064） | 無影片時的「預覽徐國峰黃金標準」畫面；**繞過關鍵幀**（即使 profile 有關鍵幀也走本地解算，與模擬器不一致） | 改用瀏覽器模組的關鍵幀取樣（D1、D9） |
| `js/analyzer.js:114–131` `triggerCycleExtraction` 的模擬訊號 fallback | `evaluateProfileCycle`（117）→ `analyzeCapturedFrames`（164） | 無影片時以 `night_track_runner` 合成 45 幀「擷取」，再本地分析 | Server 只收 landmarks、不收角度，無法沿用；建議移除（D9） |
| `js/analyzer.js:177–183` `customCycleFrames` | `evaluateProfileCycle` ×21 | 寫入 `custom_captured.customCycleFrames`；**全專案沒有任何讀取點**（死碼） | 刪除 |

### (4) renderer 畫骨架與播放端

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後的初步建議 |
| ---- | -------------- | ---- | ------------------ |
| `js/renderer.js:43–56` `drawSimulator` | `getActiveRunnerTiming`（45）、`evalCycle`（50、53）、`solveKinematics`（55、56） | 主角＋徐國峰虛影骨架；即時同步時改用 `livePoseOverride`（46–49） | `solveKinematics`、關鍵幀取樣移到瀏覽器模組（D1）；計時讀 profile 值 |
| `js/renderer.js:58–95` 軌跡 | `solveKinematics(refProfile.evalCycle(tp))`（65）、`solveKinematics(activeProfile.evalCycle(tp))`（84） | 每個動畫影格各 81 次取樣＋解算 | 同上；**頻率決定必須本地**（見盤點結論 1） |
| `js/renderer.js:141–147` 相位標記 | `solveKinematics`（142）×4 | 四個相位點 | 同上 |
| `js/renderer.js:209` | `computeGctMetrics` | 觸地／騰空 HUD（`stancePct`） | 讀衍生結果（D5） |
| `js/renderer.js:442–461` `drawBiomechAnnotations` | `RUNNER_PROFILES`；內嵌 `isBiomechanicalRunner`／`isWalkGait` 門檻 | 標註文字與好壞配色 | 判斷式暫留 UI（D10）；`isWalk` 優先讀 `metrics.isWalking` 的取捨記入 D10 |
| `js/renderer.js:563–569`、`618`、`665–697` `drawWaveform` | `computeGctMetrics`、`getActiveRunnerTiming`、`evalCycle` ×51 ×3 | 波形與色帶 | 同 `drawSimulator` |
| `js/renderer.js:709–726` `animateLoop` | 間接：每個 `requestAnimationFrame` 呼叫 `drawSimulator`＋`drawWaveform` | 動畫迴圈 | 不變 |
| `js/report.js:17–49` `captureSkeletonSnapshots`、`52–58` `buildReportHtml` | → `drawSimulator`；`computeGctMetrics`（56）、`computePersonalizedPhaseTiming`（58） | 報告骨架截圖與 GCT 段落（3.4 搬入） | 讀衍生結果；3.4 規格引用本決策 |
| `js/ui.js:270–279`、`290–297` | `getActiveRunnerTiming` | 相位跳轉、相位 HUD | 讀 profile 值 |

### (5) `RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming`

| 位置 | 內容 | 3.3 之後的初步建議 |
| ---- | ---- | ------------------ |
| `js/config.js:43–123` `RUNNER_PROFILES` | 三個內建 profile（`hsu_pose_method`、`night_track_runner`、`custom_captured` 佔位）：`name`、`cadence`、`appearance`、`summary`（含 `phaseTiming`）＋ `evalCycle` 方法 | 拆成「靜態資料」與「執行期狀態」（D3）：靜態資料放瀏覽器可用模組並附烘焙的關鍵幀與衍生值；方法移除 |
| 寫入點 | `js/ui.js:142`（`name`）、`js/analyzer.js:174–175`（`cadence`／`summary`）、`183`（`customCycleFrames`）、`330`（新增 `json_*`）、`350`（`cycleKeyframes`）、`index.html:1371–1372`、`1390`（步幅）、`1427`（`cadence`）、`1554`（`phaseTiming`）、`js/biomechanics.js:404`（`getActiveRunnerTiming` 改寫 `phaseTiming`） | 執行期狀態集中到 Client 狀態模組；靜態資料不可被改寫（複製後再改） |
| 讀取點 | `js/renderer.js:44`、`52`、`443`、`564`、`658`、`715`；`js/report.js:53`、`171`；`js/analyzer.js:439`；`js/ui.js:180–185`；`index.html:1340`、`1354`、`1402`、`1413`、`1426`、`1510`、`1551`、`2061` | 改讀狀態模組 |
| `js/state.js:1` `activeProfileKey` | 目前 profile 的 key（全域可變） | 留 Client 狀態 |
| `js/biomechanics.js:387–399` `evaluateProfileCycle` | 呼叫端：`js/analyzer.js:117`、`180`；`index.html:2063` | 刪除（D4） |
| `js/biomechanics.js:401–409` `getActiveRunnerTiming` | 每次呼叫都以 `computePersonalizedPhaseTiming` **改寫** `profile.summary.phaseTiming`；呼叫端 `js/renderer.js:45`、`618`；`js/ui.js:192`、`271`、`294`；`js/analyzer.js:453` | 改為唯讀取值（D4） |

### (6) 其他依賴（不在原列表，但同樣阻擋 3.3）

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後的初步建議 |
| ---- | -------------- | ---- | ------------------ |
| `js/analyzer.js:1–13` `extractExactAnglesWithAspectCorrection` | `extractAnglesFromLandmarks` | **每個 MediaPipe 影格**解算角度；自動偵測方向並 `setRunDirection` | 不在瀏覽器解算（D8） |
| `js/analyzer.js:39–49` | （上列結果） | 即時 HUD（軀幹／膝／肘角度）與「即時同步」骨架（`livePoseOverride`，畫在 `js/renderer.js:46–49`） | D8：建議移除或改為只畫 MediaPipe 骨架 |
| `js/analyzer.js:51–80` | `evaluateCaptureFrame` | 擷取閘門：決定收／丟／結束；收滿 55 幀（77）即結算 | 改由 Server 重跑閘門（已是 `lib/server/analyze.js:47–53`）；Client 需要新的停止條件（D8） |
| `js/analyzer.js:158–169` | `analyzeCapturedFrames` | `< 8` 幀放棄；本地分析 | 改 `POST /api/analyze`（3.3 本體） |
| `index.html:1591–1626` 及其後至 `updateTelemetryAndDiagnostics` 結尾 | 無核心呼叫，但**內嵌評分門檻**（`isTrunkGood`、`isKneeGood`… 與 `calculateOverallRunningScore` 相同的判斷） | 診斷卡、弱項文字 | D10：3.3 暫留；日後改由 `metrics.indicatorScores`（契約已預留） |
| `js/config.js:23–40` `applyAppConfig` | `APP_CONFIG` | 寫入頁面標題等 DOM | 非核心，3.2 隨 UI 搬入（`lib/config.js` 已非 server-only） |

### 本專案對應位置（`lib/core/`，皆 server-only）

| 函式 | 位置 | 舊 Client 是否需要 |
| ---- | ---- | ------------------ |
| `computePersonalizedPhaseTiming` | `lib/core/biomechanics.js:7` | 是（(1)(2)(4)） |
| `computeGctMetrics` | `lib/core/biomechanics.js:55` | 是（(1)(4)） |
| `generatePoseMethodAlignedCycle` | `lib/core/biomechanics.js:174`（步幅影響骨架：`:290`） | 是（退回路徑） |
| `computeAutoStrideMeters`／`computeStrideForCameraMode`／`parseManualStrideValue` | `lib/core/biomechanics.js:389`／`438`／`475` | 是（(1)） |
| `solveKinematics` | `lib/core/biomechanics.js:481` | 是（(4)，Server 不使用） |
| `normalizeCycleKeyframes`／`sampleCycleKeyframes`／`evaluateProfileAngles` | `lib/core/keyframes.js:27`／`75`／`100` | 是（(2)(3)(4)，Server 不使用） |
| `calculateOverallRunningScore` | `lib/core/cycle-analysis.js:13` | 是（(1)） |
| `extractAnglesFromLandmarks`／`evaluateCaptureFrame` | `lib/core/landmark-extract.js:16`／`207` | 是（(6)） |
| `validateAnalysisJSON` | `lib/contract/validate-analysis-json.js:5`（**非** server-only） | 已可直接使用 |

`evaluateProfileCycle`、`getActiveRunnerTiming`、`RUNNER_PROFILES` 依 1.1 決定未搬入本專案。

### 盤點結論

1. **骨架繪製與播放取樣必須在瀏覽器**：`animateLoop` 每個影格呼叫 `drawSimulator`＋`drawWaveform`，每影格約 168 次 `solveKinematics`（2＋81＋81＋4）與約 321 次角度取樣（模擬器 168、波形 51 × 3），不可能逐次打 API。`solveKinematics` 是固定肢段長度的正向運動學（rAnkle 公式已公開在契約 2.5），Server 不使用；`sampleCycleKeyframes`／`normalizeCycleKeyframes` 只處理契約格式。這三者適合移到瀏覽器可用模組。
2. **真正的演算法**（`generatePoseMethodAlignedCycle`、`computeGctMetrics`、`computePersonalizedPhaseTiming`、`calculateOverallRunningScore`、步幅推算、角度擷取與閘門）在舊 Client 有大量非分析流程的呼叫點；若都留在瀏覽器，就違反「核心只存在於 server-only 模組」。
3. **內建 profile 永遠走退回路徑**，所以移除 `generatePoseMethodAlignedCycle` 前，徐國峰虛影、`night_track_runner`、`custom_captured` 佔位都需要另一個關鍵幀來源。舊專案 `context/features/2-2-player-mode.md` 第 24 行已建議「內建 Profile 改用預先烘焙的靜態關鍵幀」。
4. **Server 目前的回應不足以取代本地計算**：`metrics` 只有 `gctMs`、`flightMs`、`isWalking`、`overallScore`（`lib/server/analyze.js:85–90`），但 UI 還用到 `computeGctMetrics` 的 `stancePct`、`flightLabel`、`skipHsuCompare`、`diffMs`、`hsuGctMs`、`ratingText`、`ratingColor`；回應也沒有偵測到的 `runDirection`。3.3 須擴充回應（契約 MINOR）或接受功能縮減。
5. **既有缺陷（只記錄，不在 3.1 修）**：
   - `getActiveRunnerTiming` 每次呼叫都把正規化結果寫回 `summary.phaseTiming`，而 `pullPct` 的正規化（`< 68` 時 `min(85, pullPct + 20)`）**不是冪等的**：`pullPct < 48` 的匯入檔會在連續影格中漂移（例如 40 → 60 → 80）。Server 產出的 `pullPct` 落在 72–86，不受影響。
   - `renderSimVideo`（`index.html:2063`）繞過關鍵幀，與模擬器畫面不一致。
   - `customCycleFrames` 是死碼。
6. **3.2「原樣搬入」與 3.3「移除本地解算」之間有過渡期**：原樣搬入的 Client 若要「行為不變」，就必須連同舊核心 script 一起進瀏覽器（見 D0）。

## 範圍

### 目錄與檔名

```
docs/
  client-server-boundary.md          # 新增：決策文件（本 Feature 的主要產出）
  planning/epics-and-features.md     # 更新：3.1 狀態、3.2／3.3 說明、待處理兩條、必要時新增 Feature 列
  analysis-json-contract.md          # 視需要：加「待 3.3 變更」註記（不改契約內容）
context/
  current-feature.md                 # Notes（驗證結果）
```

- **不修改** `lib/`、`app/`、`tests/`、`package.json`、`package-lock.json`、`next.config.mjs`、`vitest.config.mjs`、`docs/privacy.md`、`docs/server-api.md`、`README.md`。
- 不新增 npm 依賴、不新增測試（理由見設計決策 5）。
- 只讀舊專案；驗證用的暫存腳本放 scratchpad，不提交。

### 非範圍

- 任何程式變更：拆模組、烘焙 profile、新 API、擴充回應、刪除死碼、修 `getActiveRunnerTiming` 漂移（3.2／3.3 或另開 Feature）。
- 撰寫 3.2、3.3 的規格檔（本 Feature 只提供決策作為其輸入）。
- 修改 `docs/privacy.md`（3.1 沒有行為變更；影響列入決策文件，由 3.2／3.3 套用）。
- 契約升版（`schemaVersion` 維持 `1.0.0`；是否升 MINOR 是決策內容，執行在 3.3）。
- 判斷式合併（`isWalking`／`isBiomechanicalRunner`，路線圖既有待處理項）。
- 修改舊專案；提交 `.temp/`。

## 設計決策

### 1. 產出分工

- **`docs/client-server-boundary.md`** 是 Client／Server 邊界的正本：盤點、函式歸屬、決策與理由。3.2、3.3、3.4 規格引用它，不重複大段內容。
- **路線圖**只寫結論（一行一項）並連到決策文件。
- **本規格**保留盤點表作為撰寫依據；決策文件可整理、合併表格，但不可刪去任何呼叫點。

### 2. `docs/client-server-boundary.md` 章節

以繁體中文撰寫。

1. **目的與結論摘要**（5–8 點）：3.3 之後瀏覽器裡有什麼、沒有什麼。
2. **盤點基準**：舊專案 commit `e29766d`、盤點方法（grep 的函式名稱清單）、與本專案 `lib/core/` 的對應。
3. **依賴盤點**：本規格 (1)–(6) 的表格（可精簡用途欄，但保留每個 `檔案:行號`）。
4. **函式歸屬總表**：每個核心頂層宣告（`lib/core/*.js` 全部 export，加上未搬入的 `evaluateProfileCycle`、`getActiveRunnerTiming`、`RUNNER_PROFILES`），一列一個，欄位：歸屬（server-only／瀏覽器模組／API 提供／刪除）、3.3 之後的呼叫端、理由。
5. **決策**：D0–D11（第 4 節），每項寫「選項、決定、理由、影響的 Feature」。使用者推翻預設時照實記錄。
6. **契約與 API 影響**：需新增或擴充的欄位、端點、`schemaVersion` 建議；`docs/server-api.md`、`docs/analysis-json-contract.md` 須在哪個 Feature 更新。
7. **隱私影響**：對 `docs/privacy.md` 各章節的影響清單（第 4 節 D11）。
8. **給 3.2／3.3／3.4 的輸入**：每個 Feature 必須包含的項目與驗收（例如 3.3 驗收「瀏覽器 bundle 不含核心特有字串」）。
9. **既有缺陷**：盤點結論 5，各附建議處理時機。
10. **未決事項**：使用者尚未確認的決策。

### 3. 「瀏覽器可用模組」的判準

決策文件須寫明一個函式可以進瀏覽器的條件，供日後判斷：

- 只處理**契約已公開的格式**或**繪圖幾何**（例如關鍵幀取樣、正向運動學）；
- 不含評分、門檻、步態判定、從 summary 推算數值的公式；
- 不 import `lib/core/` 或 `lib/server/`。

不符合者一律 server-only，由 API 或烘焙資料提供結果。

### 4. 須做的決策與建議預設

每項由實作者在決策文件中採用或依使用者指示改寫。「影響」欄指出要在哪個 Feature 落實。

| # | 決策 | 選項 | 建議預設 | 理由 | 影響 |
| - | ---- | ---- | -------- | ---- | ---- |
| D0 | **3.2 過渡期**：原樣搬入時核心怎麼辦 | (a) 舊核心 script 暫時隨 Client 進瀏覽器，3.3 移除；(b) 3.2 只搬非核心檔，核心呼叫先 stub（3.2 期間頁面功能不完整）；(c) 3.2、3.3 合併 | **(a)**，但 3.2 必須：舊核心檔集中在單一目錄、檔頭標「暫時，3.3 移除」；3.2 完成後不得部署（4.1 在 Epic 3 之後，維持）；3.3 驗收「瀏覽器資源與 `.next/static/` 不含核心特有字串」 | 路線圖既定「先原樣搬入、再改呼叫 Server」；(a) 讓 3.2 能以「行為不變」驗證；過渡期只在本地 | 3.2、3.3、1.1 Verification 第 4 步備註 |
| D1 | **播放／繪圖純函式**：拆出瀏覽器模組 vs 全部由 Server 回傳 | (a) 新增非 server-only 模組（暫名 `lib/player/`）放 `solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes`、`CYCLE_KEYFRAME_NUMERIC_FIELDS`、`CYCLE_KEYFRAME_MIN_FRAMES`，以及「只看關鍵幀」的取樣入口；(b) Server 回傳逐幀像素座標或骨架 | **(a)**，且 `lib/player/` 為**單一來源**：`lib/core/keyframes.js` 改為從它 import／轉匯出 `CYCLE_KEYFRAME_NUMERIC_FIELDS` 等（零行為變更，以 baseline 驗證），`solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes` 從 `lib/core/` 移除（Server 不使用） | 呼叫頻率（盤點結論 1）使 (b) 不可行；(b) 也綁死畫布尺寸。單一來源避免兩份程式漂移 | 3.3（或 3.3 之前的小型 `refactor-` Feature）；`tests/core-modules.test.js` 的 9 個名稱不變 |
| D2 | **本地運動學退回路徑**是否保留 | (a) 移除：瀏覽器沒有 `generatePoseMethodAlignedCycle`，每個 profile 必須帶關鍵幀；(b) 保留：該函式進瀏覽器 | **(a)** | (b) 等於把核心骨架模型交給瀏覽器，違反專案目標；有 D3、D6、D7 後已無「缺關鍵幀」的正常路徑 | 3.3；契約第 1.4、2.5 第 4 點的「退回本地運動學」敘述須改為「缺少或不合法時不顯示骨架並提示」 |
| D3 | **`RUNNER_PROFILES` 靜態資料**放哪 | (a) 瀏覽器可用模組（暫名 `lib/profiles/`）：`name`、`cadence`、`appearance`、`summary` ＋ 以 `lib/core` 離線烘焙的 101 幀 `cycleKeyframes` 與衍生值；(b) 新端點 `GET /api/profiles`；(c) 每次載入時對內建 profile 打重算 API | **(a)**；烘焙由 Node 腳本產生，並以 Vitest 斷言「烘焙檔 == 以核心重新計算」（測試可 import 核心），避免核心改了忘記重烘 | 內建 profile 的 summary 本來就顯示在 UI；關鍵幀是輸出不是演算法。(b)(c) 多一次請求、受限流影響、離線失敗 | 3.3；`lib/config.js` 檔頭註解 |
| D4 | **`evaluateProfileCycle`／`getActiveRunnerTiming`** 去向 | — | `evaluateProfileCycle` **刪除**（呼叫端改用 D1 的取樣入口或 D9 移除）；`getActiveRunnerTiming` **改為唯讀取值**（讀 profile 上的 `phaseTiming`），不再呼叫 `computePersonalizedPhaseTiming`、不改寫 summary | 兩者都依賴可變全域狀態；唯讀化同時消除 `pullPct` 漂移 | 3.3 |
| D5 | **衍生數值**（GCT 完整物件、`phaseTiming`、總分、自動步幅）由誰算 | (a) Server 回傳、Client 只讀；(b) 這些「summary → 數值」函式進瀏覽器 | **(a)**：分析回應擴充 `metrics`（新增選填欄位，例如 `metrics.gct` 放 UI 用到的 `stancePct`、`flightLabel`、`skipHsuCompare`、`diffMs`、`hsuGctMs`、`rating`、`ratingText`、`ratingColor`、`advice`），契約升 **MINOR（1.1.0）** | (b) 交出評分與 GCT 公式。MINOR 只新增選填欄位，舊檔仍可匯入 | 3.3；`docs/analysis-json-contract.md`、`docs/server-api.md` |
| D6 | **手動改步幅／身高／步頻／機位**是否改打 API | (a) 手動步幅純本地（配速四則運算）；身高、機位、重設自動、手動步頻改打**以 summary 為輸入的重算端點**（暫名 `POST /api/derive`：輸入 `summary`、`cadence`、`heightCm`、`cameraMode`，輸出與分析回應相同的衍生欄位＋關鍵幀）；(b) 保留 landmarks 在記憶體，重送 `POST /api/analyze`；(c) 分析後鎖定這些輸入，改值須重新擷取 | **(a)** | 舊行為本來就是「以 summary 重算」（改身高不重新擷取），(a) 可逐值重現；不必重傳 landmarks；也同時解決 D7 的匯入。(b) 改變舊行為且每次重傳 landmarks；(c) 功能縮減 | 3.3（或拆成獨立 Feature）；Epic 2 存取控制沿用 `checkAccess`；`oninput` 須 debounce；`docs/server-api.md` 新增端點 |
| D7 | **舊格式 JSON 匯入**是否仍支援 | (a) 支援：`validateAnalysisJSON`（`lib/contract/`）＋`normalizeCycleKeyframes`（D1）在瀏覽器；衍生值與缺少／不合法的關鍵幀由 D6 端點補；(b) 只接受帶合法 `cycleKeyframes` 的 v1 檔；(c) 停止匯入 | **(a)**；端點失敗（4xx／5xx／429）時 alert 並中止、不改狀態；**不送 `profileName` 與檔名** | 契約第 4 節承諾 legacy 照常匯入；(b)(c) 須改契約的相容策略 | 3.3；`docs/privacy.md`（匯入的 summary 會上傳） |
| D8 | **擷取期間的即時解算**（即時角度 HUD、即時同步骨架、自動方向、擷取閘門與 55 幀結束） | (a) 移除即時角度 HUD 與即時同步，只畫 MediaPipe 骨架；擷取以「原始幀數或時間」為停止條件，閘門與方向全交 Server；(b) `extractAnglesFromLandmarks`／`evaluateCaptureFrame` 進瀏覽器 | **(a)**；停止條件的具體數值（例如擷取秒數、`LIMITS.maxFrames` 3000 以內）由 3.3 規格決定；回應新增偵測到的 `runDirection`（併入 D5 的 MINOR），讓方向標示可沿用 | (b) 交出角度擷取與閘門，這是核心最主要的部分 | 3.3；使用者可見的功能縮減須確認（見未決事項） |
| D9 | **無影片時的模擬功能**（模擬擷取、徐國峰預覽畫面） | — | 模擬擷取（`js/analyzer.js:114–131`）**移除**，無影片時擷取按鈕停用；預覽畫面保留，改用 D1 取樣＋D3 烘焙關鍵幀 | Server 不收角度，無法沿用；預覽只需播放能力 | 3.3 |
| D10 | **UI 內嵌的判斷門檻**（`index.html:1591–1626` 起、`js/renderer.js:454–461`） | (a) 3.3 原樣保留；(b) 3.3 一併改由 `metrics.indicatorScores` 提供 | **(a)**，記錄為已知缺口，另開 Feature；`isWalk` 是否改讀 `metrics.isWalking` 依「零行為變更」判斷（兩者公式相同時可改） | 縮小 3.3 範圍；這些是顯示用門檻，比評分公式容易被看出 | 另開 Feature（建議與判斷式合併的 `refactor-` 一起） |
| D11 | **對 `docs/privacy.md` 與 3.2／3.3 規格的影響** | — | 見下方清單 | — | 3.2、3.3 |

D11 清單（寫入決策文件第 7、8 章）：

- `privacy.md` 第 2 節「目前狀態」：3.2 起頁面會擷取影像（MediaPipe 在瀏覽器）；**3.2 過渡期核心在瀏覽器**（D0）、3.3 起移除。
- 第 3 節「上傳的資料」：若採 D6／D7，新增重算端點的欄位表（`summary` 數值、`cadence`、`heightCm`、`cameraMode`；無 landmarks、無檔名），並註明「匯入 JSON 時會上傳其中的 summary」。
- 第 8 節「第三方資源」：3.2 起 MediaPipe（`cdn.jsdelivr.net`）、字型（Google Fonts）、Tailwind CDN（舊 `index.html:15`）的處理。
- 第 9 節：舊 Client 不使用 localStorage（盤點時 grep 確認），3.2 搬入後重新確認。
- 第 10 節：新增「新增重算端點（D6）」為須同步本文件的情況。
- 3.2 規格：D0 的過渡做法與驗收；搬入時保留本規格引用的 `檔案:行號` 對應（或在 3.2 Notes 記錄新位置），讓 3.3 能追蹤。
- 3.3 規格：D1–D9 的落實項目、契約 MINOR、`tests/privacy-docs.test.js` 須擴充的檢查（例如新端點也只 log 固定字串；`lib/player/`、`lib/profiles/` 不 import `lib/core`／`lib/server`）。

### 5. 是否新增文件一致性測試：**不新增**

- 決策文件的 `檔案:行號` 指向**舊專案**（repo 外、機器相依的絕對路徑），寫成測試會在其他機器或 CI 上失敗；舊專案原樣保留、行號不會漂移，一次性核對即可。
- 決策文件描述的是「未來」的歸屬，對應的程式（`lib/player/` 等）尚不存在，無從斷言；這類檢查（例如 `lib/player/` 不 import 核心）應在 3.3 隨程式一起加入。
- 因此改以 Verification 第 3 步的**一次性核對腳本**（放 scratchpad，不提交）驗證每個 `檔案:行號`，結果寫入 Notes。
- 本專案側的引用（`lib/core/*.js:行號`）同樣由該腳本核對。

### 6. 路線圖寫回方式

`/feature complete` 時：

- 3.1 狀態 `done`，說明改為一句結論＋連到 `docs/client-server-boundary.md`。
- 3.2、3.3（必要時 3.4）說明依決策更新（例如 3.3 加上「契約 1.1.0、重算端點、`lib/player/`、`lib/profiles/`」）。
- 「待處理」中 `solveKinematics`…與 `RUNNER_PROFILES`…兩條改為 ✅，寫明決定並連到決策文件。
- 若 D1 的單一來源整理或 D6 的端點決定另開 Feature，在 Epic 3 表格新增列（狀態 `planned`）。
- 盤點結論 5 的既有缺陷若不併入 3.3，新增「待處理」條目。

## 驗收標準

1. `docs/client-server-boundary.md` 存在，涵蓋設計決策 2 的 10 個章節。
2. 依賴盤點包含本規格 (1)–(6) 的**每一個**呼叫點，`檔案:行號` 與舊專案 commit `e29766d` 一致（Verification 第 3 步）。
3. 函式歸屬總表涵蓋 `lib/core/` 所有 export 與 `evaluateProfileCycle`、`getActiveRunnerTiming`、`RUNNER_PROFILES`，每列都有歸屬與理由。
4. D0–D11 每項都有決定與理由；採用的決定若與本規格預設不同，記錄使用者的指示。
5. 契約、API、隱私的影響清單明確指出由哪個 Feature 落實；文件**不宣稱**任何尚未實作的行為已存在。
6. 路線圖已依設計決策 6 更新，連結正確。
7. `git diff --stat` 只出現 `docs/`、`context/` 下的檔案；`lib/`、`app/`、`tests/`、`package.json`、`next.config.mjs` 無變更。
8. `npm run build`、`npm run lint` 通過；`REQUIRE_BASELINE=1 npm test` 全過且基準不變：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。**
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**，記下基準數值；另跑一次不帶變數的 `npm test`。
3. **`檔案:行號` 核對（一次性腳本，放 scratchpad、不提交）**：從 `docs/client-server-boundary.md` 擷取所有 `` `路徑:行號` `` 與 `` `路徑:起–迄` ``，對舊專案（`D:\MyWeb\Running form analyzer`）或本專案讀取該行（或區間），確認表格同列所列的函式名稱或識別字出現在其中。全部命中才算通過；未命中的逐一修正文件。另確認舊專案 `git log -1` 仍為 `e29766d`。
4. **盤點完整性**：在舊專案 `js/`（排除四個核心檔本身）與 `index.html` 重新 grep 以下名稱，確認每個命中都在決策文件中：`solveKinematics`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles`、`evaluateProfileCycle`、`getActiveRunnerTiming`、`RUNNER_PROFILES`、`computePersonalizedPhaseTiming`、`computeGctMetrics`、`generatePoseMethodAlignedCycle`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`parseManualStrideValue`、`calculateOverallRunningScore`、`analyzeCapturedFrames`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame`、`evalCycle`、`cycleKeyframes`。
5. **連結檢查**：決策文件、路線圖、契約註記中的相對連結都指向存在的檔案與錨點。
6. **不需要 Playwright／互動驗證**：本 Feature 沒有 UI 或 API 變更；在 Notes 註明「無 UI／API 變更，略過 `AGENTS.md` 第 3、4 項」。
7. **`git diff` 檢查**：`git diff --stat` 只有 `docs/`、`context/`；`git diff -- lib app tests package.json next.config.mjs` 為空。
8. `git status` 只有本 Feature 的檔案；`.temp/` 未提交；舊專案 `git status` 乾淨。

## 已知風險

- **決策跨越多個 Feature**：D1、D3、D5、D6 會讓 3.3 範圍明顯變大（新模組、烘焙腳本、契約 MINOR、新端點）。決策文件須建議是否把 D1（單一來源整理）、D6（重算端點）拆成獨立 Feature，避免 3.3 一次變更過多。
- **重算端點擴大攻擊面與限流壓力**：D6 讓「不經 MediaPipe 的請求」也能取得衍生值（相當於可查詢評分公式的 oracle）。但 `/api/analyze` 已有同樣性質，差別在輸入更容易偽造。決策文件須如實記載；限流仍僅盡力而為。
- **功能縮減**：D8（移除即時角度 HUD／即時同步）、D9（移除模擬擷取）是使用者可見的變更，必須由使用者確認，不能由實作者自行決定。
- **D0 過渡期核心在瀏覽器**：3.2 完成到 3.3 完成之間，本地 build 的瀏覽器資源包含核心。只要不部署就不外流；4.1 前須以 3.3 的驗收確認已移除。
- **烘焙資料與核心漂移**：D3 若沒有「烘焙檔 == 重新計算」的測試，核心修正後內建 profile 會與分析結果不一致。
- **行號依賴舊專案不變**：若舊專案日後被修改，決策文件的行號會失準；文件以 commit `e29766d` 為準並註明。
- **盤點只靠 grep 名稱**：經由 `this`、字串或動態屬性的間接呼叫可能漏掉（已知例子：`evalCycle` 方法經 `this` 呼叫 `evaluateProfileAngles`）。Verification 第 4 步把 `evalCycle`、`cycleKeyframes` 也列入 grep。

## 未決事項

**沒有阻擋開工的事項**：start 後即可依本規格撰寫盤點與決策文件，D0–D11 先採建議預設。

以下須在 **3.1 complete 之前**由使用者確認（決策文件會依確認結果定稿）：

1. **保護範圍（決定 D5、D6、D8 的方向）**：「核心只在 server-only」是否涵蓋評分、GCT、相位計時、步幅推算與角度擷取？建議：**是**（依專案目標與舊 `docs/REFACTOR_PLAN.md` 第二階段的動機）。若使用者接受這些函式進瀏覽器，D5／D6／D8 改為 (b)，3.3 範圍大幅縮小。
2. **D8、D9 的功能縮減**：3.3 起移除即時角度 HUD、即時同步骨架、無影片的模擬擷取，是否可接受？
3. **D6 新增重算端點**：是否接受新增第二個 API（`POST /api/derive`，暫名）？不接受時改採 (c)「分析後鎖定輸入」，且 D7 只能採 (b)（只接受帶合法關鍵幀的 v1 檔）。

以下為已採用、可於 review 時推翻的預設：D0 (a)、D1 (a) 單一來源 `lib/player/`、D2 (a)、D3 (a) 烘焙、D4、D5 契約 MINOR 1.1.0、D7 (a)、D10 (a)；不新增一致性測試（設計決策 5）；3.1 不修改 `docs/privacy.md`。
