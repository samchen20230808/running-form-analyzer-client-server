# Current Feature: 3.2 搬入現有 Client UI

## Status

In Progress

## Goals

- 舊 Client（`index.html`、`styles/main.css`、`js/*.js`）原樣搬入 `public/legacy/`，`/` 以 307 導向 `/legacy/index.html`，行為與舊專案相同。
- 舊核心四檔集中到 `public/legacy/temp-core/`，檔頭 3 行 `TEMP-CORE` 標示（暫時，3.3 移除）；與 server-only `lib/core/` 不互相引用。
- 「完成後不部署」防線：`VERCEL` 環境且 temp-core 存在時 build 失敗；文件措辭同步。
- 新增 `tests/legacy-client.test.js`；如實更新 `docs/privacy.md`、`README.md`、`AGENTS.md`、`docs/client-server-boundary.md`。
- 不改 `lib/`；baseline 不變（walk 103／361ms／96；landmarks 193／176／150）。

## Notes

規格：`context/features/3-2-client-ui-migration.md`（Opus 撰寫）。待決定 1–4 皆採規格預設：A 靜態 `public/legacy/`；`report.js` 不搬、報告按鈕 disabled（3.4）；加 `VERCEL` 部署防線；第三方資源維持 CDN 原樣不釘版。

**Baseline（動手前）**：`REQUIRE_BASELINE=1 npm test` 158 通過；`npm run build` 成功（路由 `/`、`/api/analyze` 等）。舊專案 `e29766d`、工作區乾淨。

**驗證結果**
- `npm run lint` 無問題；`REQUIRE_BASELINE=1 npm test` 167 通過（不帶變數 166＋1 skip）；`npm run build` 成功（`/` 路由由 redirect 取代，路由表只剩 `/_not-found`、`/api/analyze`、`/icon.svg`）；`git diff -- lib` 為空。
- 原樣比對（位元組）：`js/{config,state,ui,renderer,pose,analyzer}.js`、`main.css` 與舊檔相同；四支 temp-core 去掉 3 行檔頭後與舊檔相同；`index.html` 僅 217、1329–1332、1334 行有同行替換，行數相同。檔案皆為 CRLF，以 node 寫入避免 Git Bash `sed -i` 吃掉 CR。
- `VERCEL=1 npm run build` 失敗並顯示「public/legacy/temp-core 仍存在…」。temp-core 特有字串基準：`行走步態 (雙腳交替支撐` 與 `嚴重跨步煞車或身後推蹬` 在 `biomechanics.js` 各 1 次命中，`.next/static` 零命中（供 3.3 對照）。
- HTTP（dev，port 3100）：`GET /` 307 → `/legacy/index.html`；`/legacy/index.html`、`temp-core/biomechanics.js`、`js/config.js`、`styles/main.css?v=3.1` 皆 200；`/legacy/index.html` 無 API 的 CSP；`/api/analyze` 仍帶 CSP。
- Playwright（使用者先關閉占用的瀏覽器）：載入 `/` 後 console 0 error、1 warning（Tailwind CDN production 警告，預期）；network 全為 2xx／3xx（含 CDN 與字型）。選影片後 MediaPipe 由 `cdn.jsdelivr.net/npm/@mediapipe/pose/` 載入 `pose_landmark_heavy.tflite`、`pose_web.binarypb`、`pose_solution_packed_assets(.data/_loader.js)`、`pose_solution_simd_wasm_bin(.js/.wasm)`，皆 200。
- 互動：匯入 walk JSON → 步頻 103 spm、觸地 361ms、總分 96，與基準一致；切 Profile（`hsu_pose_method` 99／183ms／184、`night_track_runner` 35／294ms／166、`custom_captured`、匯入的 json 設定檔）皆有更新；播放／暫停按鈕切換、播放中 canvas 持續變化；選擇 `woman03 - Trim.mp4`（複製到 `.temp/mp4/`，不提交，因 Playwright 只允許專案內檔案）→ 智慧擷取完成、產生 `custom_captured`（36／249ms／192 spm）；拖入影片（對 `#videoDropZone` 派發 `drop`）載入新 blob；匯出 JSON 產生 `schemaVersion 1.0.0` 檔案；匯入後 `json_*` 設定檔可選；報告按鈕 disabled；「預覽徐國峰標準動作訊號」按鈕可點無 error。
- 未涵蓋／限制：「暫停時 canvas 穩定」未取得乾淨結論（波形等 canvas 本身持續更新，僅確認播放中會變化）；「匯出再匯入數值不變」只驗證匯出檔可產生，未做完整往返比對；`getImageData` 的 Canvas2D warning 來自驗證腳本自己的像素取樣。
- 規格驗證項目未做或僅部分完成：MediaPipe 解析到的版本與檔案大小未記錄（CDN 未釘版，4.1 前釘版時須實測）；相位跳轉與 `ghost`／`trail` 圖層切換未逐項驗證；預覽徐國峰訊號只確認按鈕可點無 error，未驗證開關狀態；與舊專案 baseline 截圖及並排比對未做；`POST /api/analyze` 本 Feature 未改，只確認 `/api/analyze` 仍帶 CSP，由既有測試覆蓋 5 個標頭。
- Opus review 結論可 complete，已處理：Notes 補遺漏、邊界文件第 2 章補行號對照、privacy 補第三方 script 與 `VERCEL` 前提／`vercel env pull` 風險、測試改用 regex 並新增「核心字串只在 temp-core」。已知：部署防線依賴 Vercel build 有 `VERCEL`，4.1 前實測；報告按鈕無 disabled 視覺樣式，3.4 處理。
- 既有缺陷（未修）：行走 HUD 左右腳標示錯誤（`fix-walking-hud-foot-label`，建議 3.3 後）。
- 對照：temp-core 為凍結副本，不隨 `lib/core/` 同步；過渡期 `APP_CONFIG` 有兩份（`lib/config.js`、`public/legacy/js/config.js`），版本號由測試把關。`.next/static` 零命中不再代表「瀏覽器拿不到核心」——`public/legacy/temp-core/` 會被公開提供。

## History

<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

### 2026-11-11 — Feature 0.1: 建立 repo 與工作流程

`git init`（預設分支 `master`）；建立 `AGENTS.md`、`CLAUDE.md`、`.gitignore`、feature skill（`.agents/` 為本體、`.claude/` 轉指）、`context/current-feature.md`、`docs/planning/epics-and-features.md` 與各 Feature 規格。決策：單一 Next.js 專案單一部署；JavaScript＋Vitest；同源存取控制方案 A；Client 先原樣搬入再改呼叫 Server；舊專案原樣保留。此 Feature 為啟動檔案，直接在 `master` 提交，之後的 Feature 走 branch 流程。

### 2026-11-11 — Feature 0.2: Next.js 骨架與 baseline

建立 Next.js 16.4.6（App Router、JavaScript、Node 24.x）骨架：`app/layout.js`、`app/page.js`（佔位頁）、`app/icon.svg`；Vitest 5 與 ESLint 9（Next 16 無 `next lint`，改用 `eslint .`＋`eslint-config-next/core-web-vitals`）；`lib/config.js` 只搬純資料 `APP_CONFIG`（`applyAppConfig` 留給 Epic 3、`RUNNER_PROFILES` 留給 1.1）。baseline：從舊專案複製 9 個樣本到 `.temp/json/`（不提交），`tests/baseline.test.js` 驗格式與基準步頻（walk 103；landmarks 176／150／193；`kf-*` 101 幀），路徑相對測試檔，`REQUIRE_BASELINE=1` 時缺樣本即失敗。

驗證：lint、test（7 通過、1 skip；`REQUIRE_BASELINE=1` 為 8 通過）、build 通過；dev＋Playwright console 0 error、無資源 404。Opus review 通過，已處理 5 項建議：`.gitignore` 改 `.env*`（保留 `!.env.example`）、baseline 路徑與缺樣本語意、`APP_CONFIG` 完整比對、文件狀態。已知：`npm audit` 7 項 moderate 皆為 eslint 開發期依賴 `minimatch`；`next dev` 自動追加於 `AGENTS.md` 的英文區塊予以保留；1.1 開工前須先決定「觸地 361ms／總分 96」的基準值來源。Spec: `context/features/0-2-nextjs-skeleton-baseline.md`。

### 2026-11-11 — Feature 1.1: 核心純計算模組搬成 ES module

把舊專案 vm 載入的核心搬成 `lib/core/`：`biomechanics`、`keyframes`、`landmark-extract`、`cycle-analysis`、`keyframes-builder`（由 1.2 提前），函式本體逐字照搬；每檔第一行 `import "server-only"`，`index.js` 僅匯出舊 load-core 的 9 個名稱。Vitest 用 alias 指向 `tests/stubs/server-only.js`，不新增依賴。決策：`RUNNER_PROFILES`／`evaluateProfileCycle`／`getActiveRunnerTiming` 屬 Client 狀態，不搬、留 Epic 3；門檻 55／8 與 isWalking／isBiomechanicalRunner 判斷式 1.1 不合併。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 25 通過（不帶變數 24 通過、1 skip）；walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 關鍵幀字串逐字相同、三份 landmarks（193／176／150）與 client 樣本完全一致；逐字 diff 僅 import、檔頭註解與不搬的兩函式；Client Component import 核心 build 失敗（指出 server-only），Server Component 可 build 且 `.next/static` 無核心字串。無 UI／API 變更，略過 Playwright。Opus review 通過，已處理 5 項建議。已知：361ms 只證明步頻 103 路徑；`solveKinematics` 等無 baseline 覆蓋的函式僅靠逐字 diff；無 README.md；`@/` 別名未設定；舊 Client 用到的 `solveKinematics`／`normalizeCycleKeyframes`／`sampleCycleKeyframes` 去向留 3.1 決定。Spec: `context/features/1-1-core-esm-modules.md`。

### 2026-11-11 — Feature 1.2: analyze 主流程與契約 v1.0.0

把舊 `analyzeRequest`、`LIMITS`／`validateRequest` 搬成 `lib/server/analyze.js`、`validate-request.js`（server-only，核心只經 `lib/core/index.js`），`plain()` 照留；`validateAnalysisJSON` 放 `lib/contract/`（非 server-only，只 import `../config.js`）。決策：`analyzeRequest` 不做 HTTP，回傳 `{ ok, result }` 或 `invalid_request`／`payload_too_large`／`insufficient_frames`（匯出 `ANALYZE_ERRORS`），狀態碼 400／413／422 由 1.3 對應；55／8 進入 `LIMITS`；`isWalking`／`isBiomechanicalRunner` 判斷式不合併（另開 refactor）；舊契約文件複製為 `docs/analysis-json-contract.md`；刪除 `tests/helpers/landmarks-pipeline.js`，baseline 改用正式 `analyzeRequest`。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 68 通過；walk 103／361ms／96、`kf-*` 逐字相同、三份 landmarks（193／176／150）與 client 樣本 `toStrictEqual`，`validateAnalysisJSON` 無 warning、產生端義務全過；逐字 diff 僅 import、`export`、註解與回傳形狀；舊新 `analyzeRequest` 14 項對照一致；client import `lib/server` build 失敗（指出 server-only），import `lib/contract` build 成功且 bundle 無核心字串。無 UI／API 變更，略過 Playwright。Opus review 通過，已處理 import 白名單 regex、3000 幀邊界、`schemaVersion: null` 等建議。已知：`isWalking` true 分支無 landmarks 樣本，僅靠逐字 diff；`insufficient_frames` 只斷言 `acceptedFrames < 8`；55 幀停止與 `finalize` 路徑無獨立單元測試。Spec: `context/features/1-2-analyze-pipeline-contract.md`。

### 2026-11-11 — Feature 1.3: Route Handler `/api/analyze`

新增 `app/api/analyze/route.js`（只 export `runtime`、`POST`）→ `lib/server/http-handler.js`（`handleAnalyzeHttp`，框架無關）。處理順序：存取控制 → Content-Type 415 → 串流讀 body 強制 `LIMITS.maxBodyBytes` 413（`Content-Length` 只預檢，超過即 `cancel`）→ JSON 400 → `analyzeRequest`（400／413／422），非預期例外 500 `internal_error`，只 log `analyze failed`。所有回應 `Cache-Control: no-store`（`next.config.mjs` `headers()` 讓 Next 自動 405／OPTIONS 也帶），無 CORS。存取控制單一接入點 `lib/server/access-control.js`（放行 stub，status 非 400–599 視為實作錯誤回 500），Epic 2 只換此模組。新增 `docs/server-api.md`。決策：Content-Type 嚴格比對 media type（與舊 Server 唯一刻意差異）；其餘安全標頭留 2.1；405 交給 Next。

驗證：lint、build 通過（`/api/analyze` 為 `ƒ`）；`REQUIRE_BASELINE=1 npm test` 105 通過（不帶變數 103＋1 skip）；walk 103／361ms／96、`kf-*` 逐字相同、三份 landmarks 經 `POST` 193／176／150 且與 `analyzeRequest` `toStrictEqual`；舊新 handler 13 案例對照一致；curl 200／400／415／422／413（兩條路徑）／405／OPTIONS 符合，`.next/static` 無核心字串。Playwright 因瀏覽器被占用，經使用者同意以 curl 驗證首頁與資源皆 200。Opus review 通過，已處理 status 防呆與測試強化。已知：Vercel 4.5 MB 平台上限待 4.1 實測；2.1 存取控制須留在 route 內，不要用 `proxy.js`；walk 樣本無 landmarks，無法經 route；`.gitignore` 加 `.vitest/`。Spec: `context/features/1-3-api-analyze-route.md`。

### 2026-11-11 — Feature 2.1: 同源存取模型

`lib/server/access-control.js` 由放行 stub 換成方案 A：Origin／`Sec-Fetch-Site` 檢查（`same-origin`／`none` 放行；其他值 403；無 `Sec-Fetch-Site` 時比對 `Origin` host 與 `Host`；兩者皆無放行）＋每 IP 固定視窗限流（60 秒 30 次，超過 429＋`Retry-After`）。先檢查 Origin 再計數，被拒的跨站請求不耗額度。IP 取 XFF 第一段 → `x-real-ip` → 共用桶 `unknown`；最多追蹤 10,000 筆，滿時先清過期、再擠最早開窗者（重開窗先 delete 再 set）。常數 `ACCESS_LIMITS` 不放 `APP_CONFIG`、不讀 env。`RESPONSE_HEADERS` 與 `next.config.mjs headers()` 補齊 5 個安全標頭（測試比對一致），無 CORS。`route.js` 不改；`http-handler.js` 只改 `RESPONSE_HEADERS`。`docs/server-api.md` 如實記載限流僅盡力而為。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 149 通過（不帶變數 148＋1 skip）；walk 103／361ms／96、三份 landmarks 193／176／150 不變；curl 實測 200／403／429／405／204 與標頭符合。Playwright 因瀏覽器被占用，經使用者同意以 curl 驗證首頁與資源；真實瀏覽器同源 `fetch` 非 403 的驗證留待 Epic 3。Opus review 通過，已補強清理測試（mutation 驗證）、403 標頭與 `Retry-After` 斷言。已知：多 instance／冷啟動使限流僅盡力而為；XFF 可信度依賴 Vercel 為最外層，4.1 部署後實測；`Host` 帶預設 port 時舊 Safari 可能誤拒；IPv6 未以 /64 限流。Spec: `context/features/2-1-same-origin-access-control.md`。

### 2026-11-11 — Feature 2.2: 隱私說明與文件

新增 `docs/privacy.md`（11 章，承諾標出對應程式位置）與 `README.md`；`docs/server-api.md`「隱私」改為摘要＋連結。修正文件與程式不符：IP 過期紀錄不會主動刪除，最長留到 instance 結束，改為如實記載。程式只改 2 檔共 3 行註解，行為零變更。新增 `tests/privacy-docs.test.js`（9 項）：唯一 log、不讀 env／不寫檔／不連線／無 cookie、回應不含原始 landmarks、文件限流數值與安全標頭同程式、README 版本同 `APP_CONFIG.version`。決策：新建 README；`privacy.md` 為隱私正本、`server-api.md` 為限流正本；IP 保存方式不改。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 158 通過（不帶變數 157＋1 skip）；baseline 不變（103／361ms／96；193／176／150）；4 項 mutation 皆使測試失敗；dev 實測終端機無 IP／body。Playwright 以 curl 取代（無 UI 變更）。Opus review 通過，已處理多項建議。已知：測試掃描範圍僅 `app/`、`lib/` 的 `.js`；Vercel 平台 log 待 4.1 查證；3.2／3.3 須重新核對 `privacy.md`。Spec: `context/features/2-2-privacy-and-docs.md`。

### 2026-11-11 — Feature 3.1: 盤點 Client 對本地解算的依賴

調查型 Feature，不改程式。新增 `docs/client-server-boundary.md`（10 章）：以舊專案 commit `e29766d` 盤點 Client 在分析流程之外對核心的依賴（改步幅／身高／步頻／機位重算、JSON 匯入、關鍵幀退回、renderer 與播放、`RUNNER_PROFILES`、擷取期間即時解算），附函式歸屬總表與 D0–D11 決策。決策：播放／繪圖函式拆至 `lib/player/`（單一來源）；內建 profile 改用烘焙關鍵幀（`lib/profiles/`）；移除本地運動學退回路徑；衍生值由 Server 回傳（契約擬升 1.1.0）；接受新增 `POST /api/derive`（暫名）；使用者決定**保留**即時角度 HUD、即時同步骨架、無影片模擬擷取，因此 `extractAnglesFromLandmarks`／`evaluateCaptureFrame` 抽共用模組進瀏覽器（`lib/landmarks/`），模擬擷取改送烘焙合成 landmarks。原則：現階段以 Client 表現與分析品質為優先，是否收緊 server-only 待使用一陣後再評估。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 158 通過，基準不變（103／361ms／96；193／176／150）；腳本核對文件 `檔案:行號`、盤點完整性 0 遺漏；`lib/ app/ tests/ package.json next.config.mjs` 無變更。無 UI／API 變更，略過 Playwright。Opus review 通過，已處理路線圖措辭、D0／D7 選項欄、契約 2.1 註解等建議。已知：D0–D5、D7、D10 為建議預設，3.2／3.3 規格階段可調整；`AGENTS.md`、`privacy.md`、README 的「核心只在 server」措辭須在 3.2／3.3 改為如實描述；既有缺陷（`pullPct` 漂移、`renderSimVideo` 繞過關鍵幀、`customCycleFrames` 死碼）預計隨 3.3 消除。Spec: `context/features/3-1-client-local-solve-inventory.md`。
