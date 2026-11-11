# Current Feature: 3.3 Client 呼叫 /api/analyze

## Status

In Progress

## Goals

- 影片擷取完成時，把擷取期間每一幀的 sanitized landmarks 以同源 `POST /api/analyze` 上傳，用 Server 回傳的 `cadence`／`summary`／`cycleKeyframes` 建立 `custom_captured`；不再呼叫本地 `analyzeCapturedFrames`（影片路徑）。
- 請求本體只含 7 個欄位（`frameWidth`、`frameHeight`、`heightCm`、`cameraMode`、`runDirection`、`isManualDirection`、`frames`），不送 `profileName`、不送 `z`。
- 錯誤處理：400／413／422／429／其他狀態、網路錯誤、逾時都提示使用者，狀態不變、console 無 error。
- 過時回應丟棄、進行中不可重複觸發；刪除 `customCycleFrames` 死碼。
- `lib/`、`public/legacy/temp-core/` 不動；基準不變（walk 103／361ms／96；landmarks 193／176／150）。
- 文件如實更新（privacy、server-api、README、AGENTS、決策文件、路線圖）。

## Notes

規格：`context/features/3-3-client-calls-analyze.md`（Opus 撰寫）。

**切分決定（使用者已確認）**：原 3.3 範圍過大（UI 每幀都依賴 temp-core 算衍生值，須先有契約 1.1.0＋derive，移除 temp-core 只能放最後），拆成 3.3 影片擷取呼叫 analyze／3.4 `lib/player`＋`lib/landmarks` 橋接／3.5 `lib/profiles` 烘焙與模擬擷取／3.6 契約 1.1.0＋`/api/derive`／3.7 UI 改讀衍生值並移除 temp-core／3.8 報告匯出（原 3.4）。路線圖與 4.1 前置（改為 3.7 完成）已更新；過渡期文字改為「3.2–3.7」。待決定採建議預設：擷取結果掛 `cycleKeyframes`、錯誤用 `alert`、上限 1500 幀／逾時 30 秒。

**Baseline（開工前）**：`npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 168 通過；walk 103／361ms／96；landmarks 193／176／150。

**實作**：`js/state.js` 新增上傳狀態與常數（`MAX_UPLOAD_FRAMES=1500`、`UPLOAD_TIMEOUT_MS=30000`）；`js/analyzer.js` 在閘門前記錄每幀 landmarks（`t` 與 `videoTime` 同一次讀取）、拆出 `requestServerAnalysis`／`applyCapturedResult`、`finalizeCycleExtraction` 影片路徑改上傳（模擬擷取仍本地）；`js/ui.js` `loadVideoFile` 遞增 `captureSeq` 作廢進行中請求；`js/config.js` 刪 `customCycleFrames`；`next.config.mjs` 只改註解（3.3→3.7）；`tests/legacy-client.test.js`「不呼叫 API」改為「`fetch` 僅一處 `/api/analyze`」、請求不含 `profileName`、上限不超過 `LIMITS`、`customCycleFrames` 已刪。

**驗證**：
- lint 無錯；build 通過；`REQUIRE_BASELINE=1 npm test` 172 通過（168＋4 新增）；`git diff -- lib app public/legacy/temp-core` 無變更；`VERCEL=1 npm run build` 仍失敗（防線在）。
- curl：`/` 307、`/legacy/js/analyzer.js` 200、跨站 POST 403、同源空 body 400，安全標頭在。
- Playwright：載入 console 0 error；用 `woman03 - Trim.mp4` 擷取 → 恰好 1 個 `POST /api/analyze`→200，鍵集合 7 個、112 幀、每幀 `{t, lm[33×3]}`、無 `profileName`／`z`；UI 步頻 199／步幅 0.93／101 幀關鍵幀；同一批幀的本地 `analyzeCapturedFrames` 與 Server `summary`、`cadence` 完全相同。
- 錯誤注入（422／429／400／413／500／abort）提示正確、profile 與步頻不變、按鈕恢復；進行中重複觸發被擋、僅 1 次請求；過時回應被丟棄且無提示。瀏覽器 console 對注入的非 2xx 會記 `Failed to load resource`（預期，非程式錯誤）。
- 回歸：無影片模擬擷取（本地，步頻 158）、切 Profile、匯入 walk JSON 顯示 103／361ms／96 皆正常。

**Opus review 後修正**：擷取中途換影片改為作廢擷取並清空舊幀；200 但 body 不是合法 `summary`／`cadence` 改走錯誤提示（`AbortError` 重新丟出成逾時）；`finalizeCycleExtraction` 防護改為 `if (!isCapturingCycle) return`；privacy 補「每次擷取完成」「最多約 3.5 MB」「`profileName` 舊 Client 不送」；路線圖待處理的「3.3」改 3.4–3.7。偏離規格：上傳量測試係數由 2800 改 2400（1500×2800=4.2 MB 已超過 4 MB 上限，規格本身不成立；每幀最壞約 2.25 KB）。

**既有缺陷（本 Feature 不處理）**：`ended` 時僅 8–14 個接受幀不會 finalize（按鈕停在擷取中）；收滿 1500 幀但接受幀 < 8 時只顯示 ✅ 無結果；模擬擷取 `setTimeout(finalize, 450)` 無 seq 防護；`showCaptureDone` 的 2.5 秒計時器可能覆蓋下一次擷取的按鈕文字。身高超出 50–250 或座標超出範圍時本地可算、Server 回 400（提示已說明）。

**已知／未驗**：逾時 30 秒路徑未實際等待驗證；真實的 `loadVideoFile` 在請求進行中換影片未用真影片重現（以 `captureSeq++` 模擬）；拖入影片、骨架播放／相位跳轉／圖層切換未逐項重測（本 Feature 未動這些程式）；擷取中途手動改方向或身高時，Server 以起點值重跑，結果可能與即時 HUD 不同；temp-core 檔頭「3.3 移除」現指 3.7（檔案不得改）。3.4 橋接機制、3.5 合成 landmarks 可行性為後續未決事項。

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

### 2026-11-11 — Feature 3.2: 搬入現有 Client UI

舊 Client（`index.html`、`styles/main.css`、`js/*.js`）原樣搬入 `public/legacy/`，`next.config.mjs` `redirects()` 讓 `/` 307 導向 `/legacy/index.html`，刪除佔位的 `app/page.js`。舊核心四檔集中於 `public/legacy/temp-core/`（檔頭 3 行 `TEMP-CORE`，行號為舊行號 +3），不被 `lib/`、`app/` 引用。部署防線：`VERCEL` 環境且 temp-core 存在時 build 失敗（3.3 移除時一併拿掉）。ESLint 忽略 `public/legacy/**`。`index.html` 僅 6 行同行替換（核心路徑改 `temp-core/`、不搬 `report.js`、報告按鈕 disabled，留 3.4）。新增 `tests/legacy-client.test.js`；同步更新 `privacy.md`、README、AGENTS、邊界文件。決策（規格預設）：靜態 `public/legacy/`；`report.js` 不搬；加部署防線；第三方資源維持 CDN 不釘版。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 168 通過；基準不變（103／361ms／96；193／176／150）；`lib/` 無變更；位元組比對僅規格列出的差異；`VERCEL=1 npm run build` 失敗符合預期；Playwright 載入 console 0 error、資源皆 2xx／3xx，匯入 walk 樣本顯示 103／361ms／96，切 Profile、播放、選影片與智慧擷取、拖入影片、匯出 JSON 可用。Opus review 可 complete，已處理多項建議。已知：暫時核心會被公開提供，3.3 前不可部署；部署防線依賴 Vercel 有 `VERCEL`，4.1 前實測；MediaPipe 版本與大小未記錄、相位跳轉與圖層切換、預覽開關、截圖並排比對未逐項驗；報告按鈕無 disabled 視覺樣式；行走 HUD 左右腳標示錯誤未修；`APP_CONFIG` 過渡期兩份。Spec: `context/features/3-2-client-ui-migration.md`。
