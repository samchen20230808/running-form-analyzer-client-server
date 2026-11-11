# Running Form Analyzer（Next.js 單一部署版）— Epics and Features

## 1. 文件目的

本文件是新專案的實作路線圖。舊專案（`D:\MyWeb\Running form analyzer`，原樣保留）的背景見其 `docs/REFACTOR_PLAN.md`、`docs/analysis-json-contract.md`、`docs/server-api.md`；每個 Feature 的規格在 `context/features/`。

狀態值：`planned` → `ready-for-dev` → `in-progress` → `done`。

## 2. 已決定事項

- ✅ 單一 Next.js 專案、單一 Vercel 部署（不再分 Client 靜態頁與獨立 Server）。
- ✅ Next.js App Router、JavaScript；核心演算法為 ES module，不使用 `node:vm`。
- ✅ 測試用 Vitest，以「與 baseline 逐值一致」驗證核心搬遷。
- ✅ 存取控制採「方案 A」：同源、無長效 key、Origin 檢查＋每 IP 限流＋請求驗證＋安全標頭；封裝為單一模組以便日後升級。
- ✅ Client 先原樣搬入、再改呼叫 Server，之後才逐步 React 化。
- ✅ 預設分支 `master`；舊專案原樣保留作參考。

## 3. 交付原則

- **核心零行為變更**：Epic 1 搬遷不得改變任何數值輸出（基準：walk 樣本步頻 103／觸地 361ms／總分 96，及三份 landmarks 樣本步頻 193／176／150）。
- 核心演算法只存在於 server-only 模組（`import "server-only"`），不得進入瀏覽器 bundle。
- 每個 Feature 可獨立驗證、獨立 commit；驗證方式見 `AGENTS.md`。
- 對外動作（部署、push、設定環境變數）一律由使用者操作。

---

## Epic 0 — 專案啟動與工作流程

| Feature | 名稱                       | 狀態    | 說明                                                                          |
| ------- | -------------------------- | ------- | ----------------------------------------------------------------------------- |
| 0.1     | 建立 repo 與工作流程       | done    | `git init`、`AGENTS.md`、feature skill、`context/`、路線圖                    |
| 0.2     | Next.js 骨架與 baseline    | done    | Next.js＋Vitest 骨架、`APP_CONFIG`、baseline fixtures 與逐值比對測試的基礎設施 |

## Epic 1 — 核心演算法 ESM 化（server-only）

| Feature | 名稱                         | 狀態    | 說明                                                                                  |
| ------- | ---------------------------- | ------- | ------------------------------------------------------------------------------------- |
| 1.1     | 核心純計算模組搬成 ES module | done | `biomechanics`、`keyframes`、`landmark-extract`、`cycle-analysis`、`keyframes-builder`（由 1.2 提前）；與 baseline 逐值一致 |
| 1.2     | analyze 主流程與契約 v1.0.0  | in progress | `analyzeRequest`（回傳錯誤類型，狀態碼由 1.3 對應）、`LIMITS`／`validateRequest`、`validateAnalysisJSON`（`lib/contract/`，非 server-only）；契約文件搬入；baseline 改用正式 `analyzeRequest`，已刪除 `tests/helpers/landmarks-pipeline.js` |
| 1.3     | Route Handler `/api/analyze` | planned | 請求驗證（範圍、大小上限）、錯誤格式、不回傳 stack；錯誤類型 → 狀態碼對應（400／413／422，非預期例外 500）、`LIMITS.maxBodyBytes` 讀 body 上限 |

## Epic 2 — 存取控制（同源）

| Feature | 名稱             | 狀態    | 說明                                                                    |
| ------- | ---------------- | ------- | ----------------------------------------------------------------------- |
| 2.1     | 同源存取模型     | planned | Origin／`Sec-Fetch-Site` 檢查、每 IP 限流、安全標頭、無 CORS；單一模組   |
| 2.2     | 隱私說明與文件   | planned | 只上傳 landmarks、不儲存不記錄；限流限制如實記載                        |

## Epic 3 — Client 改為呼叫 Server

| Feature | 名稱                         | 狀態    | 說明                                                                                   |
| ------- | ---------------------------- | ------- | -------------------------------------------------------------------------------------- |
| 3.1     | 盤點 Client 對本地解算的依賴 | planned | 調查，不改程式：手動改步幅／身高重算、舊格式 JSON 匯入、關鍵幀缺少時的退回路徑         |
| 3.2     | 搬入現有 Client UI           | planned | `index.html` 與渲染／UI 程式原樣搬入 Next.js，行為不變                                 |
| 3.3     | Client 呼叫 `/api/analyze`   | planned | 擷取 landmarks 上傳、渲染結果；移除本地解算                                            |
| 3.4     | 報告匯出                     | planned | 舊專案 Feature 3.1（瀏覽器列印另存 PDF）搬入                                           |

## Epic 4 — 部署（單一 Vercel 專案）

| Feature | 名稱             | 狀態    | 說明                                                                                           |
| ------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 4.1     | Vercel 設定與驗證 | planned | Root Directory 為 repo 根目錄、Node 24.x、區域 `hnd1`；部署與環境變數由使用者操作；agent 準備文件與驗證腳本 |

---

## 待處理（來自舊專案）

- ⏳ 行走模型 HUD 左右腳標示錯誤（舊 `fix-walking-hud-foot-label`）：搬入 Client（3.2）後另開 `fix-` 處理。
- ⏳ 門檻 55／8 與 `isWalking`／`isBiomechanicalRunner` 多處重複：1.1 不合併（只照原樣搬，位置見 `context/features/1-1-core-esm-modules.md` 第 5 節）；55／8 已於 1.2 成為 `LIMITS.maxAcceptedFrames`／`minAcceptedFrames`（Server 端單一來源；Client 的 `>= 55`／`< 8` 於 3.2 搬入後暫時重複，3.3 移除本地解算時消失）。判斷式合併 1.2 不處理，另開 `refactor-` Feature（建議 3.2 之後），開工前先補「步頻 < 135」與「avgElbow／hipRomDeg 為 null」的對照值（現有 landmarks 樣本步頻皆 ≥ 135，`isWalking` 的 true 分支只靠逐字 diff）。
- ✅ 「觸地 361ms／總分 96」基準來源已確認：由核心 `computeGctMetrics`／`calculateOverallRunningScore` 對 walk summary 計算得出，比對方式見 1.1 規格；建議以 `REQUIRE_BASELINE=1 npm test` 執行，缺樣本直接失敗。
- ⏳ 舊 Client 會用到、但現在位於 server-only 核心的函式：`solveKinematics`（renderer 畫骨架）、`normalizeCycleKeyframes`（analyzer 匯入檢查）、`sampleCycleKeyframes`／`evaluateProfileAngles`（播放端）。3.1 須決定：拆出瀏覽器可用的播放／繪圖純函式模組，或全部改由 Server 回傳結果。
- ⏳ `RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 屬 Client 狀態，1.1 不搬；3.1 盤點 Client 依賴時決定去向（是否保留本地運動學退回路徑、profile 靜態資料放哪裡）。
- ⏳ 限流改外部儲存（Upstash Redis）：把服務開放給他人之前再評估。
- ⏳ 骨架時序平滑（One Euro）原型：舊專案 branch `feature-skeleton-smoothing-proto`，擱置。
