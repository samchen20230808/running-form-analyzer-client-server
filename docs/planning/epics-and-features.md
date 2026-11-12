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
| 1.2     | analyze 主流程與契約 v1.0.0  | done | `analyzeRequest`（回傳錯誤類型，狀態碼由 1.3 對應）、`LIMITS`／`validateRequest`、`validateAnalysisJSON`（`lib/contract/`，非 server-only）；契約文件搬入；baseline 改用正式 `analyzeRequest`，已刪除 `tests/helpers/landmarks-pipeline.js` |
| 1.3     | Route Handler `/api/analyze` | done | `app/api/analyze/route.js` → `lib/server/http-handler.js`：串流讀 body 強制 `LIMITS.maxBodyBytes`、Content-Type 嚴格比對、400／413／415／422／500、`Cache-Control: no-store`；存取控制單一接入點 `lib/server/access-control.js`（放行 stub）；`docs/server-api.md` |

## Epic 2 — 存取控制（同源）

| Feature | 名稱             | 狀態    | 說明                                                                    |
| ------- | ---------------- | ------- | ----------------------------------------------------------------------- |
| 2.1     | 同源存取模型     | done | Origin／`Sec-Fetch-Site` 檢查、每 IP 限流、安全標頭、無 CORS；單一模組；實作於 `lib/server/access-control.js`，其餘安全標頭加入 `RESPONSE_HEADERS` 與 `next.config.mjs` `headers()`    |
| 2.2     | 隱私說明與文件   | done | `docs/privacy.md`、`README.md`、`tests/privacy-docs.test.js`（文件與程式一致性）；IP 保留期間如實記載 |

## Epic 3 — Client 改為呼叫 Server

| Feature | 名稱                         | 狀態    | 說明                                                                                   |
| ------- | ---------------------------- | ------- | -------------------------------------------------------------------------------------- |
| 3.1     | 盤點 Client 對本地解算的依賴 | done | 調查，不改程式；結論見 [`docs/client-server-boundary.md`](../client-server-boundary.md)：播放／繪圖函式拆至 `lib/player/`、內建 profile 烘焙關鍵幀（`lib/profiles/`）、移除本地運動學退回路徑、衍生值由 Server 回傳（契約 1.1.0）、重算端點 `POST /api/derive`（暫名）；D8／D9 已決定保留即時 HUD／同步骨架／模擬擷取（角度擷取與閘門進瀏覽器，`lib/landmarks/`）；D6 端點 `POST /api/derive` 已接受；現階段以 Client 表現優先，是否收緊 server-only 待使用一陣後再評估 |
| 3.2     | 搬入現有 Client UI           | done | 舊 Client 原樣放入 `public/legacy/`，`/` 以 307 導向 `/legacy/index.html`；舊核心暫存 `public/legacy/temp-core/`（`TEMP-CORE` 檔頭），`VERCEL` 環境 build 會失敗，3.3 移除前不得部署；規格見 [`3-2`](../../context/features/3-2-client-ui-migration.md) |
| 3.3     | Client 呼叫 `/api/analyze`   | done | 影片擷取完成時上傳 landmarks、套用 Server 結果；錯誤提示、過時回應丟棄；刪除 `customCycleFrames`；`lib/` 不動、temp-core 與部署防線保留；規格見 [`3-3`](../../context/features/3-3-client-calls-analyze.md) |
| 3.4     | 瀏覽器共用模組與橋接         | done | `lib/player/`、`lib/landmarks/` 為單一來源（`lib/core/` 轉匯出）；`npm run sync:legacy` 複製到 `public/legacy/modules/`，`window.RFA` 橋接，UI 6 組呼叫點已切換；`evaluateProfileAngles` 留 3.5；規格見 [`3-4`](../../context/features/3-4-browser-shared-modules-bridge.md) |
| 3.5     | 內建 profile 烘焙與模擬擷取  | planned | `lib/profiles/` 烘焙關鍵幀、合成 landmarks 模擬擷取、移除本地運動學退回路徑、`getActiveRunnerTiming` 唯讀（D2–D4、D9）；合成 landmarks 須先做原型確認可行 |
| 3.6     | 衍生值 API                   | planned | 契約 1.1.0（`metrics.gct` 完整物件）＋ `POST /api/derive`；只動 Server（D5、D6） |
| 3.7     | Client 改讀衍生值並移除 temp-core | planned | UI 改讀 `metrics`／derive、移除 `public/legacy/temp-core/` 與 `VERCEL` 部署防線、bundle 檢查、改寫過渡期文件；完成後才可進 4.1 |
| 3.8     | 報告匯出                     | planned | 原 3.4：舊專案 Feature 3.1（瀏覽器列印另存 PDF）搬入；只讀衍生結果，不呼叫核心 |
| 3.9     | 頁面改為根路徑 `/index.html` | planned | 使用者要求：`npm run dev` 後直接以 `http://localhost:3000/index.html` 開啟（現為 `/legacy/index.html`，`/` 307 導向）；規格階段決定作法（建議先評估「整包搬到 `public/` 根目錄並移除 `/`→legacy 轉址」或「只加 `/index.html` 轉址」），連動 `tests/legacy-client.test.js`、`scripts/sync-legacy-modules.mjs` 目的地、文件；建議排在 3.5 之前，避免後續 Feature 沿用舊路徑 |

## Epic 4 — 部署（單一 Vercel 專案）

| Feature | 名稱             | 狀態    | 說明                                                                                           |
| ------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 4.1     | Vercel 設定與驗證 | planned | **前置：3.7 完成（`public/legacy/temp-core/` 已移除）**，並實測 Vercel build 有 `VERCEL`、頁面安全標頭／第三方資源釘版或自託管另開 Feature；Root Directory 為 repo 根目錄、Node 24.x、區域 `hnd1`；部署與環境變數由使用者操作；agent 準備文件與驗證腳本 |

## Epic 5 — PWA 與手機版 UI（最後階段）

| Feature | 名稱        | 狀態    | 說明                                                                                           |
| ------- | ----------- | ------- | ---------------------------------------------------------------------------------------------- |
| 5.1     | 手機版 UI   | planned | 使用者要求：頁面在手機尺寸可用（版面、觸控操作、影片選擇／拍攝、骨架畫布縮放）；規格階段決定是在舊頁面調整 RWD，或隨 React 化重做；需實機或 Playwright 手機視窗驗證 |
| 5.2     | PWA         | planned | 使用者要求：web app manifest、圖示、service worker（離線殼層）、可安裝；須決定快取範圍（`/api/analyze` 不快取、MediaPipe CDN 資源是否預快取）、更新策略與版本號同步（`APP_CONFIG`）；需 HTTPS（Epic 4 部署後）；建議在 5.1 之後 |

前置：Epic 4 完成（PWA 需要 HTTPS 的實際部署網址）；3.9 完成（路徑確定後再設定 manifest `start_url`／service worker scope）。

---

## 待處理（來自舊專案）

- ⏳ 行走模型 HUD 左右腳標示錯誤（舊 `fix-walking-hud-foot-label`）：Client 已搬入（3.2），可另開 `fix-` 處理（建議 3.7 之後，位置見 3.2 規格第 10 節）。
- ⏳ 門檻 55／8 與 `isWalking`／`isBiomechanicalRunner` 多處重複：1.1 不合併（只照原樣搬，位置見 `context/features/1-1-core-esm-modules.md` 第 5 節）；55／8 已於 1.2 成為 `LIMITS.maxAcceptedFrames`／`minAcceptedFrames`（Server 端單一來源；Client 的 `>= 55`／`< 8` 已於 3.2 搬入後暫時重複，3.7 移除本地解算時消失）。判斷式合併 1.2 不處理，另開 `refactor-` Feature（建議 3.2 之後），開工前先補「步頻 < 135」與「avgElbow／hipRomDeg 為 null」的對照值（現有 landmarks 樣本步頻皆 ≥ 135，`isWalking` 的 true 分支只靠逐字 diff）。
- ✅ 「觸地 361ms／總分 96」基準來源已確認：由核心 `computeGctMetrics`／`calculateOverallRunningScore` 對 walk summary 計算得出，比對方式見 1.1 規格；建議以 `REQUIRE_BASELINE=1 npm test` 執行，缺樣本直接失敗。
- ⏳（3.1 建議預設；見 [決策文件](../client-server-boundary.md)，3.4 已落實 `lib/player/`、`lib/landmarks/`，`evaluateProfileAngles` 拆分於 3.5；其餘由 3.5–3.7 落實）舊 Client 會用到、但現在位於 server-only 核心的函式：`solveKinematics`（renderer 畫骨架）、`normalizeCycleKeyframes`（analyzer 匯入檢查）、`sampleCycleKeyframes`／`evaluateProfileAngles`（播放端）。建議預設：拆出瀏覽器可用的 `lib/player/`（`solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes`，單一來源），其餘由 Server 回傳。
- ⏳（3.1 建議預設；見 [決策文件](../client-server-boundary.md)，由 3.3 落實）`RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 屬 Client 狀態，1.1 不搬；建議預設：移除本地運動學退回路徑；profile 靜態資料放 `lib/profiles/` 並附烘焙關鍵幀；`evaluateProfileCycle` 刪除、`getActiveRunnerTiming` 改唯讀。
- ⏳ 限流改外部儲存（Upstash Redis）：把服務開放給他人之前再評估。
- ⏳ 骨架時序平滑（One Euro）原型：舊專案 branch `feature-skeleton-smoothing-proto`，擱置。
- ⏳ 既有缺陷（見決策文件第 9 章）：`getActiveRunnerTiming` 的 `pullPct` 漂移、`renderSimVideo` 繞過關鍵幀、`customCycleFrames` 死碼；預計隨 3.3（D4、D9）消除。
- ⏳ UI 內嵌評分門檻（`index.html:1591` 起）3.3 暫留，建議與判斷式合併的 `refactor-` 一併另開 Feature（D10）。
