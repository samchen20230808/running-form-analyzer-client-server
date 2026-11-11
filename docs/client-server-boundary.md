# Client／Server 邊界與本地解算依賴盤點

> 狀態：Feature 3.1 產出（調查，不改程式）。本文件描述 3.3 之後**預期**的邊界；文中提到的模組（`lib/player/`、`lib/profiles/`）、端點（`POST /api/derive`）與契約 1.1.0 **目前都不存在**。落實的 Feature 因 3.3 規格而重新編號：3.3 影片擷取呼叫 `/api/analyze`；3.4 D1／D8（`lib/player/`、`lib/landmarks/`、橋接）；3.5 D2–D4／D9（`lib/profiles/`、模擬擷取）；3.6 D5／D6 的 Server 端（契約 1.1.0、`POST /api/derive`）；3.7 D5–D7 的 Client 端與移除 temp-core；原 3.4 報告匯出改為 3.8。下文與決策表中的「3.3」除特別標示外，一律指「3.4–3.7」。
> 規格：[`context/features/3-1-client-local-solve-inventory.md`](../context/features/3-1-client-local-solve-inventory.md)。

## 1. 目的與結論摘要

舊專案的 Client 在瀏覽器內直接執行整套核心。本專案的核心已是 server-only（`lib/core/`），3.3 要移除本地解算，因此須先知道舊 Client 在「分析流程之外」還有哪些地方呼叫核心。結論：

1. **骨架繪製與播放取樣留在瀏覽器**：每個動畫影格約 168 次 `solveKinematics`、約 321 次角度取樣，不可能逐次打 API。
2. **評分與骨架模型一律 server-only**：`generatePoseMethodAlignedCycle`、`computeGctMetrics`、`computePersonalizedPhaseTiming`、`calculateOverallRunningScore`、步幅推算。**角度擷取與擷取閘門（`extractAnglesFromLandmarks`、`evaluateCaptureFrame`）依使用者指示進瀏覽器**（D8），Server 仍以同一份程式重跑並驗證。
3. **本地運動學退回路徑移除**：每個 profile 必須帶關鍵幀；內建 profile 改用離線烘焙的 101 幀關鍵幀。
4. **衍生數值由 Server 回傳**：分析回應擴充 `metrics`（契約 MINOR 1.1.0）；改身高／機位／步頻與舊格式匯入經新的重算端點。
5. **即時角度 HUD、即時同步骨架、無影片模擬擷取全部保留**（使用者決定）；代價是角度擷取與閘門進入瀏覽器 bundle，且模擬擷取須改為送出預先烘焙的合成 landmarks（D9）。
6. **3.2 過渡期**：原樣搬入的 Client 暫時帶舊核心 script，3.2 完成後不部署，3.7 移除。
7. 發現 3 項既有缺陷（第 9 章），只記錄不修。

## 2. 盤點基準

- 舊專案 `D:\MyWeb\Running form analyzer`，commit **`e29766d`**，工作區乾淨；唯讀。下列行號皆以此 commit 為準，舊專案原樣保留故不應漂移。3.2 起舊 Client 搬入本專案：`index.html`、`js/{config,state,ui,renderer,pose,analyzer}.js`、`styles/main.css` 位於 `public/legacy/`（行號不變）；舊核心四檔位於 `public/legacy/temp-core/`，行號為舊行號 **+3**（檔頭 3 行 `TEMP-CORE`；檔頭寫的「3.3 移除」現指 3.7，檔案不得修改故保持原樣）。**3.3 起 `public/legacy/js/{analyzer,state,ui,config}.js` 的行號與 `e29766d` 不再相同**，查新位置請 grep 函式名。
- 方法：在舊專案 `js/`（排除四個核心檔 `biomechanics.js`、`keyframes.js`、`landmark-extract.js`、`cycle-analysis.js`）與 `index.html` grep 下列名稱：`solveKinematics`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`evaluateProfileAngles`、`evaluateProfileCycle`、`getActiveRunnerTiming`、`RUNNER_PROFILES`、`computePersonalizedPhaseTiming`、`computeGctMetrics`、`generatePoseMethodAlignedCycle`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`parseManualStrideValue`、`calculateOverallRunningScore`、`analyzeCapturedFrames`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame`、`evalCycle`、`cycleKeyframes`。
- 限制：只靠名稱 grep，經 `this`、字串或動態屬性的間接呼叫可能漏掉（已知例：`evalCycle` 經 `this` 呼叫 `evaluateProfileAngles`，故一併 grep）。
- 本專案對應：舊四個核心檔 → `lib/core/`（皆 `import "server-only"`）；`validateAnalysisJSON` → `lib/contract/`（非 server-only）。

## 3. 依賴盤點

路徑相對舊專案根目錄。「建議」欄中的 D# 見第 5 章。

### (1) 手動改步幅／身高／步頻／機位後重算

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後 |
| ---- | -------------- | ---- | -------- |
| `index.html:1337–1347` `onCameraModeChange`（觸發 `index.html:393`） | → `recalculateStrideForCameraMode` | 分析後切換機位，重算步幅與配速 | 經 D6 重算端點取得新步幅 |
| `index.html:1350–1382` `recalculateStrideForCameraMode` | `computeStrideForCameraMode`（1357） | 依機位、身高、步頻決定步幅；直接改寫 `strideMeters`／`measuredStrideMeters`／`_measuredPixelStride` | 套用 API 回傳值，不改寫 summary 其他欄位 |
| `index.html:1385–1398` `onManualStrideInput`（`index.html:145`、`302`） | `parseManualStrideValue`（1386） | 手動步幅，寫入 `summary.strideMeters`（1390）；無關鍵幀 profile 的骨架也會變（`js/biomechanics.js:288` `strideBonusDeg`） | 純 Client：配速 = 步頻 × 步幅；`parseManualStrideValue` 是輸入解析，可放 UI 模組；骨架以關鍵幀為準，不重算 |
| `index.html:1400–1409` `resetStrideToAuto`（`index.html:151`、`308`） | → `recalculateStrideForCameraMode` | 改回自動步幅 | 同機位切換（D6） |
| `index.html:1411–1421` `onHeightInputChange`（`index.html:128`） | → `recalculateStrideForCameraMode` | 改身高只重算步幅，不重新擷取角度（擷取時用身高見 `js/landmark-extract.js:115`） | 同 D6；維持「只重算步幅」 |
| `index.html:1423–1429` `onManualCadenceInput`（`index.html:267`，`oninput`） | 間接 `updateTelemetryAndDiagnostics` | 手動步頻，改寫 `profile.cadence` → 計時、GCT、總分重算 | 同 D6；`oninput` 須 debounce（限流 30 次／60 秒） |
| `index.html:1549–1628`（`updateTelemetryAndDiagnostics` 內的片段，函式實際延伸至約 2025 行；`updatePhaseTimingUI`、`drawSimulator` 等其他「函式名＋行號」同為函式內片段） | `computePersonalizedPhaseTiming`（1554，改寫 `s.phaseTiming`）、`computeGctMetrics`（1556）、`computeAutoStrideMeters`（1576）、`calculateOverallRunningScore`（1628） | 遙測、診斷卡、總分的計算中心 | 只讀 profile 上已有的衍生結果（D5） |
| `index.html:1509–1513` `updatePhaseTimingUI` | `computeGctMetrics` | GCT 色條、徐國峰比對（未傳入時備援） | 同上 |
| `js/ui.js:179–198` `switchProfile` | → `recalculateStrideForCameraMode`（187）、`getActiveRunnerTiming`（192） | 切換 profile 時重算步幅、跳 Pose 相位 | 只讀衍生結果，不重算 |
| `js/analyzer.js:172` `finalizeCycleExtraction` | → `recalculateStrideForCameraMode` | 擷取完成後依機位決定步幅 | Server 已在 `analyzeCapturedFrames` 內決定（`lib/server/analyze.js:81`），Client 直接採用 |

### (2) JSON 匯入與驗證（含舊格式）

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後 |
| ---- | -------------- | ---- | -------- |
| `js/analyzer.js:240–294` `validateAnalysisJSON` | `APP_CONFIG`（265） | 契約版本檢查、legacy 判定 | 已可在瀏覽器用：`lib/contract/validate-analysis-json.js:5` |
| `js/analyzer.js:190–237` `buildSafeSummaryFromJSON` | `computePersonalizedPhaseTiming`（225、230） | 補預設值、正規化 `phaseTiming` | 預設值補齊留 Client；`phaseTiming` 正規化改由 API（D6／D7） |
| `js/analyzer.js:296–435` `importAnalysisJSON`（`index.html:180`） | `RUNNER_PROFILES`（330）、`evaluateProfileAngles`（342）、`normalizeCycleKeyframes`（348）、→ `switchProfile`（410）、→ `updateTelemetryAndDiagnostics`（424） | 建立 `json_<時間>` profile，合法關鍵幀掛上，不合法退回本地運動學 | D7：`normalizeCycleKeyframes` 移瀏覽器模組；缺／不合法關鍵幀與 legacy 衍生值由 API 補 |
| `js/analyzer.js:437–466` `exportAnalysisJSON`（`index.html:210`） | `getActiveRunnerTiming`（453）、`APP_CONFIG`（443–444） | 匯出契約 JSON；有關鍵幀才帶出（456） | `phaseTiming` 讀 profile 值，其餘不變 |

### (3) 關鍵幀缺少時的退回路徑

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後 |
| ---- | -------------- | ---- | -------- |
| `js/keyframes.js:97–102` `evaluateProfileAngles` | `sampleCycleKeyframes`（99）或 `generatePoseMethodAlignedCycle`（101，退回） | 渲染層取骨架角度的單一入口 | 拆成只看關鍵幀的瀏覽器版取樣（D1、D2），退回分支刪除 |
| `js/config.js:66–68`、`92–94`、`119–121` 三個內建 profile 的 `evalCycle` | `evaluateProfileAngles` | 內建 profile 都沒有 `cycleKeyframes`，永遠走退回路徑 | 內建 profile 帶烘焙關鍵幀（D3） |
| `js/analyzer.js:341–343`、`346–360` | `evaluateProfileAngles`、`normalizeCycleKeyframes` | 關鍵幀不合法時 `console.warn` 並退回本地運動學 | 見 D7 |
| `js/biomechanics.js:387–399` `evaluateProfileCycle` | `generatePoseMethodAlignedCycle`、`RUNNER_PROFILES.hsu_pose_method` | 不看關鍵幀，一律本地解算 | 刪除（D4） |
| `index.html:2059–2064` `renderSimVideo` | `evaluateProfileCycle`（2063）、`solveKinematics`（2064） | 無影片時的徐國峰預覽；繞過關鍵幀 | 改用瀏覽器取樣（D1、D9） |
| `js/analyzer.js:114–131` `triggerCycleExtraction` 模擬訊號 | `evaluateProfileCycle`（117）→ `analyzeCapturedFrames`（164） | 無影片時以 `night_track_runner` 合成 45 幀再本地分析 | 保留，但改為送出預先烘焙的合成 landmarks 走 `POST /api/analyze`（D9） |
| `js/analyzer.js:177–183` `customCycleFrames` | `evaluateProfileCycle` ×21 | 寫入 `custom_captured.customCycleFrames`；全專案無讀取點（死碼） | 刪除 |

### (4) renderer 畫骨架與播放端

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後 |
| ---- | -------------- | ---- | -------- |
| `js/renderer.js:43–56` `drawSimulator` | `getActiveRunnerTiming`（45）、`evalCycle`（50、53）、`solveKinematics`（55、56） | 主角＋徐國峰虛影骨架；即時同步用 `livePoseOverride`（46–49） | `solveKinematics`、關鍵幀取樣移瀏覽器模組（D1）；計時讀 profile 值 |
| `js/renderer.js:58–95` 軌跡 | `solveKinematics(refProfile.evalCycle(tp))`（65）、`solveKinematics(activeProfile.evalCycle(tp))`（84） | 每影格各 81 次取樣＋解算 | 同上，頻率決定必須本地 |
| `js/renderer.js:141–147` 相位標記 | `solveKinematics`（142）×4 | 四個相位點 | 同上 |
| `js/renderer.js:209` | `computeGctMetrics` | 觸地／騰空 HUD（`stancePct`） | 讀衍生結果（D5） |
| `js/renderer.js:442–461` `drawBiomechAnnotations` | `RUNNER_PROFILES`；內嵌 `isBiomechanicalRunner`／`isWalkGait` 門檻 | 標註文字與好壞配色 | 判斷式暫留 UI（D10） |
| `js/renderer.js:563–569`、`618`、`665–697` `drawWaveform` | `computeGctMetrics`、`getActiveRunnerTiming`、`evalCycle` ×51 ×3 | 波形與色帶 | 同 `drawSimulator` |
| `js/renderer.js:709–726` `animateLoop` | 間接：每個 `requestAnimationFrame` 呼叫 `drawSimulator`＋`drawWaveform` | 動畫迴圈 | 不變 |
| `js/report.js:17–49` `captureSkeletonSnapshots`、`52–58` `buildReportHtml` | → `drawSimulator`；`computeGctMetrics`（56）、`computePersonalizedPhaseTiming`（58） | 報告骨架截圖與 GCT 段落（3.4 搬入） | 讀衍生結果；3.4 規格引用本文件 |
| `js/ui.js:270–279`、`290–297` | `getActiveRunnerTiming` | 相位跳轉、相位 HUD | 讀 profile 值 |

### (5) `RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming`

| 位置 | 內容 | 3.3 之後 |
| ---- | ---- | -------- |
| `js/config.js:43–123` `RUNNER_PROFILES` | 三個內建 profile（`hsu_pose_method`、`night_track_runner`、`custom_captured` 佔位）：`name`、`cadence`、`appearance`、`summary`（含 `phaseTiming`）＋ `evalCycle` | 拆成靜態資料與執行期狀態（D3）；方法移除 |
| 寫入點 | `js/ui.js:142`（`name`）、`js/analyzer.js:174–175`（`cadence`／`summary`）、`183`、`330`（新增 `json_*`）、`350`（`cycleKeyframes`）、`index.html:1369`（`_measuredPixelStride`）、`1371–1372`、`1390`、`1427`、`1554`、`js/biomechanics.js:404`（`getActiveRunnerTiming` 改寫 `phaseTiming`） | 執行期狀態集中到 Client 狀態模組；靜態資料不可被改寫（複製後再改） |
| 讀取點 | `js/renderer.js:44`、`52`、`443`、`564`、`658`、`715`；`js/report.js:53`、`171`；`js/analyzer.js:439`；`js/ui.js:180–185`；`index.html:1340`、`1354`、`1402`、`1413`、`1426`、`1510`、`1551`、`2061` | 改讀狀態模組 |
| `js/state.js:1` `activeProfileKey` | 目前 profile 的 key（全域可變） | 留 Client 狀態 |
| `js/biomechanics.js:387–399` `evaluateProfileCycle` | 呼叫端 `js/analyzer.js:117`、`180`；`index.html:2063` | 刪除（D4） |
| `js/biomechanics.js:401–409` `getActiveRunnerTiming` | 每次呼叫以 `computePersonalizedPhaseTiming` 改寫 `profile.summary.phaseTiming`；呼叫端 `js/renderer.js:45`、`618`；`js/ui.js:192`、`271`、`294`；`js/analyzer.js:453` | 改唯讀取值（D4） |

### (6) 其他依賴

| 位置 | 呼叫的核心函式 | 用途 | 3.3 之後 |
| ---- | -------------- | ---- | -------- |
| `js/analyzer.js:1–13` `extractExactAnglesWithAspectCorrection` | `extractAnglesFromLandmarks` | 每個 MediaPipe 影格解算角度，自動偵測方向並 `setRunDirection` | 保留在瀏覽器（D8），改 import 共用模組 |
| `js/analyzer.js:39–49` | （上列結果） | 即時 HUD 與「即時同步」骨架（`livePoseOverride`，畫在 `js/renderer.js:46–49`） | D8：保留 |
| `js/analyzer.js:51–80` | `evaluateCaptureFrame` | 擷取閘門，收滿 55 幀（77）即結算 | 保留在瀏覽器作停止條件與即時過濾；Server 仍重跑閘門（`lib/server/analyze.js:47–53`），不信任 Client（D8） |
| `js/analyzer.js:158–169` | `analyzeCapturedFrames` | `< 8` 幀放棄；本地分析 | 改 `POST /api/analyze`（3.3 本體） |
| `index.html:1591–1626` 起至 `updateTelemetryAndDiagnostics` 結尾 | 無核心呼叫，但內嵌評分門檻 | 診斷卡、弱項文字 | D10：3.3 暫留 |
| `js/config.js:23–40` `applyAppConfig` | `APP_CONFIG` | 寫入頁面標題等 DOM | 非核心，3.2 隨 UI 搬入（`lib/config.js` 非 server-only） |

## 4. 函式歸屬總表

「瀏覽器模組」須符合下列判準，否則一律 server-only，由 API 或烘焙資料提供結果：

- 只處理**契約已公開的格式**或**繪圖幾何**（關鍵幀取樣、正向運動學）；
- 不含評分、門檻、步態判定、從 summary 推算數值的公式；
- 不 import `lib/core/` 或 `lib/server/`。

| 函式／資料 | 位置 | 歸屬 | 3.3 之後的呼叫端 | 理由 |
| ---------- | ---- | ---- | ---------------- | ---- |
| `computePersonalizedPhaseTiming` | `lib/core/biomechanics.js:7` | server-only | `analyzeRequest`、重算端點 | 相位計時公式 |
| `computeGctMetrics` | `lib/core/biomechanics.js:55` | server-only（結果由 API 提供） | `analyzeRequest`、重算端點 | GCT／評級公式 |
| `generatePoseMethodAlignedCycle` | `lib/core/biomechanics.js:174` | server-only | 烘焙腳本、`buildCycleKeyframesFromSummary` | 骨架模型，D2 退回路徑移除 |
| `computeAutoStrideMeters` | `lib/core/biomechanics.js:389` | server-only | 重算端點 | 步幅推算 |
| `computeStrideForCameraMode` | `lib/core/biomechanics.js:438` | server-only | 分析、重算端點 | 步幅推算 |
| `parseManualStrideValue` | `lib/core/biomechanics.js:475` | 瀏覽器模組（UI 輸入解析） | 手動步幅輸入 | 純輸入解析，無演算法；若不願進瀏覽器可在 UI 重寫 |
| `solveKinematics` | `lib/core/biomechanics.js:481` | 瀏覽器模組（`lib/player/`） | renderer | 正向運動學，Server 不使用（D1） |
| `calculateOverallRunningScore` | `lib/core/cycle-analysis.js:13` | server-only | 分析、重算端點 | 評分公式 |
| `detectCadenceFromFrames` | `lib/core/cycle-analysis.js:66` | server-only | 分析 | 步頻偵測 |
| `computeCycleSummaryStats` | `lib/core/cycle-analysis.js:183` | server-only | 分析 | 週期統計 |
| `computeMeasuredPixelStride` | `lib/core/cycle-analysis.js:340` | server-only | 分析 | 像素步幅 |
| `analyzeCapturedFrames` | `lib/core/cycle-analysis.js:386` | server-only | `analyzeRequest` | 分析主流程 |
| `extractAnglesFromLandmarks` | `lib/core/landmark-extract.js:16` | 瀏覽器模組（共用單一來源，D8） | Client 即時 HUD／同步骨架、`analyzeRequest` | 使用者指示保留即時功能；Server 同樣 import |
| `evaluateCaptureFrame` | `lib/core/landmark-extract.js:207` | 瀏覽器模組（共用單一來源，D8） | Client 擷取停止條件、`analyzeRequest` | 同上；Server 重跑為準 |
| `buildCycleKeyframesFromSummary` | `lib/core/keyframes-builder.js:8` | server-only | `analyzeRequest`、重算端點、烘焙腳本 | 產生關鍵幀 |
| `CYCLE_KEYFRAME_NUMERIC_FIELDS`、`CYCLE_KEYFRAME_MIN_FRAMES` | `lib/core/keyframes.js:10`、`:24` | 瀏覽器模組（`lib/player/` 為單一來源，core 轉匯出） | 匯入檢查、取樣 | 契約公開格式 |
| `normalizeCycleKeyframes` | `lib/core/keyframes.js:27` | 瀏覽器模組（`lib/player/`） | 匯入檢查 | 只處理契約格式 |
| `sampleCycleKeyframes` | `lib/core/keyframes.js:75` | 瀏覽器模組（`lib/player/`） | renderer、波形 | 只做插值取樣 |
| `evaluateProfileAngles` | `lib/core/keyframes.js:100` | 拆分：瀏覽器版只看關鍵幀；退回分支刪除 | renderer | D1、D2 |
| `APP_CONFIG` | `lib/core/index.js:5`（來自 `lib/config.js`） | 已非 server-only，瀏覽器可直接用 | UI、匯出 | 純資料 |
| `validateAnalysisJSON` | `lib/contract/validate-analysis-json.js:5` | 已非 server-only | 匯入 | 契約驗證 |
| `evaluateProfileCycle`（未搬入） | 舊 `js/biomechanics.js:387` | 刪除 | — | D4 |
| `getActiveRunnerTiming`（未搬入） | 舊 `js/biomechanics.js:401` | 瀏覽器模組，改唯讀 | renderer、UI | D4 |
| `RUNNER_PROFILES`（未搬入） | 舊 `js/config.js:43` | 靜態資料入 `lib/profiles/`；執行期狀態入 Client 狀態模組 | UI、renderer | D3 |

## 5. 決策

> D0–D7、D10、D11 為建議預設，尚未逐項經使用者確認；D6、D8、D9 已由使用者決定（見第 10 章）。使用者推翻時在此照實記錄。

| # | 決策 | 決定 | 理由 | 影響 |
| - | ---- | ---- | ---- | ---- |
| D0 | 3.2 過渡期核心怎麼辦（選項：(a) 舊核心暫隨 Client 進瀏覽器；(b) 3.2 只搬非核心檔、核心呼叫先 stub，期間功能不完整；(c) 合併 3.2、3.3） | (a) 舊核心 script 暫時隨 Client 進瀏覽器；集中單一目錄、檔頭標「暫時，3.3 移除」；3.2 完成後不得部署；3.3 驗收「瀏覽器資源與 `.next/static/` 不含核心特有字串」 | 路線圖既定先原樣搬入再改呼叫；(a) 讓 3.2 能以行為不變驗證，過渡期只在本地 | 3.2、3.3、4.1；`context/features/1-1-core-esm-modules.md` Verification 第 4 步備註 |
| D1 | 播放／繪圖純函式 | (a) 新增非 server-only 的 `lib/player/`，放 `solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes`、常數與只看關鍵幀的取樣入口，為**單一來源**；`lib/core/keyframes.js` 改自它轉匯出常數（零行為變更，以 baseline 驗證），並把 `solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes` 從 `lib/core/` 移除（Server 不使用；`evaluateProfileAngles` 拆分時注意 import 方向，不得讓 `lib/player/` import `lib/core/`） | 呼叫頻率使「Server 回傳逐幀座標」不可行，且綁死畫布尺寸；單一來源避免兩份漂移 | 3.3 或之前的小型 `refactor-` Feature；`tests/core-modules.test.js` 的 9 個名稱不變 |
| D2 | 本地運動學退回路徑 | (a) 移除；缺少或不合法的關鍵幀時不顯示骨架並提示 | 保留等於把骨架模型交給瀏覽器；有 D3、D6、D7 後已無正常的缺關鍵幀路徑 | 3.3；契約 1.4、2.1（第 85 行）、2.5 第 4 點敘述須改 |
| D3 | `RUNNER_PROFILES` 靜態資料 | (a) `lib/profiles/`，含離線烘焙的 101 幀 `cycleKeyframes` 與衍生值；烘焙腳本產生，Vitest 斷言「烘焙檔 == 核心重新計算」 | 關鍵幀是輸出不是演算法；(b) `GET /api/profiles`、(c) 載入時重算多一次請求且受限流／離線影響 | 3.3；`lib/config.js` 檔頭註解（第 4 行提到 `RUNNER_PROFILES` 依賴 `evaluateProfileAngles`）屆時須更新 |
| D4 | `evaluateProfileCycle`／`getActiveRunnerTiming` | 前者刪除；後者改為唯讀取值，不呼叫 `computePersonalizedPhaseTiming`、不改寫 summary | 依賴可變全域狀態；唯讀化同時消除 `pullPct` 漂移 | 3.3 |
| D5 | 衍生數值由誰算 | (a) Server 回傳：`metrics` 新增選填欄位（例如 `metrics.gct`：`stancePct`、`flightLabel`、`skipHsuCompare`、`diffMs`、`hsuGctMs`、`rating`、`ratingText`、`ratingColor`、`advice`），契約升 MINOR 1.1.0 | (b) 等於交出評分與 GCT 公式；MINOR 只新增選填欄位，舊檔仍可匯入 | 3.3；契約、`docs/server-api.md` |
| D6 | 手動改步幅／身高／步頻／機位 | **(a)（使用者已接受新增端點）** 手動步幅純本地（配速四則運算）；身高、機位、重設自動、手動步頻改打以 summary 為輸入的重算端點（暫名 `POST /api/derive`：`summary`、`cadence`、`heightCm`、`cameraMode` → 與分析回應相同的衍生欄位＋關鍵幀） | 舊行為本來就是以 summary 重算，(a) 可逐值重現、不必重傳 landmarks，也解決 D7；(b) 重送 landmarks 改變舊行為；(c) 鎖定輸入是功能縮減 | 3.3 或獨立 Feature；沿用 `checkAccess`；`oninput` 須 debounce；`docs/server-api.md` 新增端點 |
| D7 | 舊格式 JSON 匯入（選項：(a) 繼續支援；(b) 只接受帶合法 `cycleKeyframes` 的 v1 檔；(c) 停止匯入） | (a) 繼續支援：`validateAnalysisJSON`＋`normalizeCycleKeyframes` 在瀏覽器，衍生值與缺／不合法的關鍵幀由 D6 端點補；端點失敗時 alert 並中止、不改狀態；**不送 `profileName` 與檔名** | 契約第 4 節承諾 legacy 照常匯入；(b)(c) 須改契約的相容策略 | 3.3；`docs/privacy.md` |
| D8 | 擷取期間的即時解算（選項：(a) 移除即時 HUD／同步骨架，閘門與方向交 Server；(b) `extractAnglesFromLandmarks`／`evaluateCaptureFrame` 進瀏覽器） | **(b)（使用者決定：全部保留）**：兩者移到非 server-only 的共用模組（暫名 `lib/landmarks/`，單一來源，`lib/core/` 與 Server 皆 import 它，零行為變更以 baseline 驗證）；Client 用於即時 HUD、即時同步骨架、自動方向與停止條件（55 幀）；Server 一律重跑閘門與角度擷取，不信任 Client | 使用者要保留即時體驗；代價是這兩個函式（角度公式與門檻）進入瀏覽器 bundle，保護範圍縮小為「評分、GCT、相位計時、步幅、骨架模型」 | 3.3（或先做小型 `refactor-` 抽出共用模組）；3.3 驗收「bundle 不含核心字串」須排除這兩個函式；`docs/privacy.md` 與 README 的「核心只在 server」敘述同步縮小範圍 |
| D9 | 無影片模擬功能 | **保留（使用者決定）**：徐國峰預覽用 D1 取樣＋D3 烘焙關鍵幀；模擬擷取改為**預先烘焙一份合成 landmarks**（由烘焙腳本用核心產生並以測試固定），無影片時按擷取即送出這份資料走 `POST /api/analyze`，不再本地合成角度或本地分析 | Server 只收 landmarks；舊作法（合成角度再本地分析）需要 `evaluateProfileCycle`／`analyzeCapturedFrames` 進瀏覽器，不可行。注意：合成 landmarks 須能通過閘門且不被誤判，3.3 規格須驗證 | 3.3；烘焙腳本與測試 |
| D10 | UI 內嵌判斷門檻 | (a) 3.3 原樣保留，記錄為已知缺口，另開 Feature（建議與 `isWalking`／`isBiomechanicalRunner` 判斷式合併的 `refactor-` 一起）；`isWalk` 改讀 `metrics.isWalking` 僅在兩者公式相同時才做 | 縮小 3.3 範圍；這些是顯示用門檻 | 另開 Feature |
| D11 | 對隱私與 3.2／3.3 的影響 | 見第 7、8 章 | — | 3.2、3.3 |

## 6. 契約與 API 影響

| 項目 | 內容 | 落實 |
| ---- | ---- | ---- |
| 契約 MINOR 1.1.0 | `metrics` 新增選填的 GCT 完整物件；`runDirection` 因 Client 仍即時偵測（D8）而非必要，可選填回傳供對照（D5）；`schemaVersion` 目前維持 `1.0.0`，本 Feature 不升版 | 3.3；更新 `docs/analysis-json-contract.md` |
| 契約敘述修正 | 第 1.4、2.1 範例註解（`docs/analysis-json-contract.md:85`）、2.5 第 4 點的「退回本地運動學」改為「缺少或不合法時不顯示骨架並提示」（D2） | 3.3 |
| 新端點 | `POST /api/derive`（暫名，D6）；輸入 `summary`、`cadence`、`heightCm`、`cameraMode`，不含 landmarks 與檔名 | 3.3 或獨立 Feature；更新 `docs/server-api.md` |
| 風險 | 端點讓「不經 MediaPipe 的請求」也能取得衍生值，輸入比 `/api/analyze` 更容易偽造（相當於可查詢評分公式的 oracle）；`/api/analyze` 已有同性質。限流仍僅盡力而為 | 3.3 規格如實記載 |

## 7. 隱私影響（`docs/privacy.md` 須在 3.2／3.3 同步）

- 第 1、4 節與 README：「核心只在 server」須縮小為「評分、GCT、相位計時、步幅、骨架模型只在 server；角度擷取與擷取閘門也在瀏覽器執行」（D8）。
- 第 2 節「目前狀態」：3.2 起頁面會擷取影像（MediaPipe 在瀏覽器）；3.2 過渡期核心在瀏覽器（D0）、3.3 起移除。
- 第 3 節「上傳的資料」：採 D6／D7 時新增重算端點欄位表（`summary` 數值、`cadence`、`heightCm`、`cameraMode`；無 landmarks、無檔名），並註明「匯入 JSON 時會上傳其中的 summary」。
- 第 8 節「第三方資源」：3.2 起 MediaPipe（`cdn.jsdelivr.net`）、字型（Google Fonts）、Tailwind CDN（舊 `index.html:15`）的處理。
- 第 9 節：舊 Client 不使用 localStorage（盤點時確認），3.2 搬入後重新確認。
- 第 10 節：新增「新增重算端點（D6）」為須同步本文件的情況。
- 本 Feature（3.1）沒有行為變更，不修改 `docs/privacy.md`。

## 8. 給 3.2／3.3／3.4 的輸入

- **3.2（已完成，見 [規格](../context/features/3-2-client-ui-migration.md)；檔案位置與行號對照見第 2 章）**：落實 D0（舊核心集中單一目錄、檔頭標暫時、完成後不部署）；搬入時保留本文件引用的 `檔案:行號` 對應，或在 Notes 記錄新位置；重新核對 `docs/privacy.md`。
- **3.3（已完成，見 [規格](../context/features/3-3-client-calls-analyze.md)）**：只做影片擷取改呼叫 `/api/analyze`、錯誤提示、過時回應丟棄、刪除 `customCycleFrames`；`lib/` 與 temp-core 不動。**3.4–3.7**（原 3.3 的範圍，依相依順序拆分）：落實 D1–D9（含 D8 的 `lib/landmarks/` 共用模組、D9 的合成 landmarks 烘焙）；`lib/player/`、`lib/profiles/`＋烘焙腳本與「烘焙 == 重算」測試、契約 1.1.0、重算端點、移除本地運動學退回路徑與本地合成的模擬擷取（模擬擷取功能本身保留）；驗收「瀏覽器資源與 `.next/static/` 不含核心特有字串」；擴充 `tests/privacy-docs.test.js`（新端點也只 log 固定字串；`lib/player/`、`lib/profiles/` 不 import `lib/core`／`lib/server`）；重新核對 `docs/privacy.md`。建議評估是否把 D1（單一來源整理）與 D6（重算端點）拆成獨立 Feature，避免 3.3 一次變更過多。
- **3.8（原 3.4）**：報告匯出讀衍生結果（`js/report.js` 依賴見第 3 章 (4)），不得呼叫核心。

## 9. 既有缺陷（只記錄，不在 3.1 修）

| 缺陷 | 說明 | 建議時機 |
| ---- | ---- | -------- |
| `getActiveRunnerTiming` 漂移 | 每次呼叫把正規化結果寫回 `summary.phaseTiming`，而 `pullPct` 正規化（`< 68` 時 `min(85, pullPct + 20)`）不冪等：`pullPct < 48` 的匯入檔連續影格會漂移（40 → 60 → 80）。Server 產出的 `pullPct` 落在 72–86，不受影響 | 3.3（D4 唯讀化即消除） |
| `renderSimVideo` 繞過關鍵幀 | `index.html:2063` 與模擬器畫面不一致 | 3.3（D9） |
| `customCycleFrames` 死碼 | `js/analyzer.js:177–183` 寫入但無讀取點 | 已於 3.3 刪除 |

## 10. 未決事項與使用者決定

使用者決定（2026-11-11）：

1. **設計原則**：目前以 **Client 表現與分析品質最優**為出發點；「核心只在 server-only」不再是不可妥協的硬限制，**待實際使用一段時間後再評估是否收緊到 server-only**。
2. **即時 HUD、即時同步骨架、無影片模擬擷取全部保留**（D8、D9）。
3. **接受新增 `POST /api/derive`（暫名，D6）**。

對本文件的影響：

- D5／D6 維持 (a)（衍生值由 Server 算並回傳）作為**目前預設**，但這是「現階段選擇」而非保護承諾；若 3.3 實作時發現某函式進瀏覽器能明顯改善表現（例如手動步頻 `oninput` 的即時性），可在決策文件新增紀錄後改採 (b)，不需再次取得同意。
- 為了讓日後「收緊」或「放寬」都低成本，所有搬動的函式都維持**單一來源、純函式、不依賴可變全域狀態**（D1、D4、D8 已如此設計），歸屬變動只需調整 import 位置。
- `docs/privacy.md`、README、`AGENTS.md`「專案背景」中「核心演算法只存在於 server-only 模組」的措辭，須在 3.2／3.3 依實際落地情況改為如實描述；**不得宣稱尚未達成的保護**。
- 待評估項（使用一陣後）：是否把角度擷取、閘門（D8）與其他衍生計算收回 server-only；評估依據為實際使用感受、延遲與限流壓力。
