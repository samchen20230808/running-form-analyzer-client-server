# 專案歷史（已完成的 Feature）

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

### 2026-11-11 — Feature 3.3: Client 呼叫 `/api/analyze`

原 3.3 範圍過大（UI 每幀都依賴 temp-core 算衍生值，須先有契約 1.1.0＋derive，移除 temp-core 只能放最後），經使用者確認拆成 3.3–3.7，報告匯出改為 3.8，4.1 前置改為「3.7 完成」，過渡期改為 3.2–3.7。本 Feature 只做影片擷取改呼叫 API：`public/legacy/js/analyzer.js` 在閘門前記錄每幀 sanitized landmarks（`t` 與 `videoTime` 同一次讀取），完成時同源 `POST /api/analyze`（7 個欄位，不送 `profileName`／`z`，上限 1500 幀、逾時 30 秒），以 Server 的 `cadence`／`summary`／`cycleKeyframes` 建立 `custom_captured`；錯誤用 `alert` 提示，`captureSeq` 丟棄過時回應，換影片作廢進行中的擷取；刪除 `customCycleFrames`。`lib/`、temp-core 不動，部署防線保留（仍不可部署）。`tests/legacy-client.test.js` 改為 `fetch` 僅一處、請求不含 `profileName`、上限不超過 `LIMITS`。同步 privacy／server-api／README／AGENTS／決策文件／路線圖。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 172 通過；基準不變（103／361ms／96；193／176／150）；`VERCEL=1` build 仍失敗。Playwright：`woman03 - Trim.mp4` 擷取恰好 1 個 POST→200，Server 與同批幀本地分析的 `summary`／`cadence` 完全相同；注入 422／429／400／413／500／abort／200 壞 body 提示正確且狀態不變；重複觸發被擋、過時回應丟棄、擷取中換影片清空舊幀；模擬擷取、切 Profile、匯入 walk JSON 正常。Opus review 後修正換影片混幀、壞 body 例外、finalize 防護與文件措辭。已知：30 秒逾時路徑未實際等待；拖入影片、骨架播放、圖層切換未逐項重測；`ended` 僅 8–14 接受幀不結算、滿 1500 幀但接受幀 < 8 無結果、模擬擷取 450ms 計時器無防護、✅ 計時器可能覆蓋文字；上傳量測試係數 2400（規格 2800 本身超過 4 MB）。後續未決：3.4 橋接機制（建議複製到 `public/legacy/modules/`）、3.5 合成 landmarks 可行性。Spec: `context/features/3-3-client-calls-analyze.md`。

### 2026-11-12 — Feature 3.4: 瀏覽器共用模組與橋接

把必須在瀏覽器執行的純函式從 server-only 的 `lib/core/` 搬成單一來源：`lib/player/`（`normalizeCycleKeyframes`／`sampleCycleKeyframes`／常數、`solveKinematics`、`parseManualStrideValue`）與 `lib/landmarks/`（`extractAnglesFromLandmarks`／`evaluateCaptureFrame`），函式本體逐字照搬；`lib/core/` 改由它們轉匯出，`index.js` 的 9 個名稱不變，刪除 `lib/core/landmark-extract.js`。橋接：`npm run sync:legacy`（`scripts/sync-legacy-modules.mjs`，含 import 自我檢查）複製到 `public/legacy/modules/`（提交進 git），手寫 `modules/bridge.js` 掛 `window.RFA`，`index.html` 同行載入；舊 UI 6 組呼叫點同行改用 `RFA.*`。`evaluateProfileAngles` 因退回分支需 server-only 函式，留 3.5。temp-core 與部署防線保留（仍不可部署）。新增 `tests/browser-modules.test.js`，補強 `legacy-client`／`core-modules` 測試；同步文件與路線圖，並新增 3.9（頁面改為根路徑 `/index.html`）。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 185 通過；基準不變（103／361ms／96；193／176／150）；改 `lib/player` 一字元，同步測試失敗並提示指令；`.next/static` 無核心字串；`/legacy/modules/*.js` 200 JavaScript MIME；Playwright console 0 error，三個 profile × 101 點 `solveKinematics` 與 temp-core 全域版相等，woman03 擷取 1 個 POST、101 幀，切 Profile、播放、相位、圖層、匯入 JSON、手動步幅可用。Opus review：程式可 complete，已修文件同步與 import 檢查漏洞。已知：拖入影片、模擬擷取、壞關鍵幀退回、`DOMContentLoaded` 時 `RFA` 存在未直接驗；壞資料測試僅 `{}`／`null`；C4 字串清單只用 4 個；`sync:legacy` 需手動執行，dev 不會自動同步；AGENTS.md 同步規則待使用者決定。Spec: `context/features/3-4-browser-shared-modules-bridge.md`。

### 2026-11-12 — Feature 3.9: 頁面改為根路徑 /index.html

把舊 Client 的 `index.html`、`js/`、`styles/`、`modules/` 用 `git mv` 從 `public/legacy/` 搬到 `public/` 根目錄（除 `index.html` 4 個 temp-core `src` 改為 `legacy/temp-core/…` 外，內容逐位元組不變）；暫時核心留在 `public/legacy/temp-core/`，部署防線不動。`/` 仍 307 轉址，目的地改 `/index.html`，舊 `/legacy/index.html` 不保留（404）。同步腳本目的地改 `public/modules/`，lint 忽略改三個明確目錄；測試改新路徑並新增 E1–E3（目錄結構、temp-core 引用、轉址）；同步 README、privacy、boundary、路線圖與 `AGENTS.md:62` 的 `public/js/config.js`。另有獨立 `fix:`：核心二骨架頭被圖例遮住，`groundY` 402→462、畫布高 420→480。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 188 通過，基準 103／361ms／96 不變；`VERCEL=1` build 仍失敗（仍不可部署）；故意改錯 E2／B1 均會失敗並已還原；curl：`/` 307、`/index.html` 200、舊路徑 404、資源 200；Playwright 無 console error、無 404、`window.RFA` 已掛。Opus review：零行為變更、測試有效。未驗：影片擷取、切 Profile、拖入影片等互動（檔案內容與 3.4 相同）、bundle 核心字串掃描、UI 修正僅看單一相位。Spec: `context/features/3-9-root-index-html.md`。

### 2026-11-12 — Feature 3.5: 內建 profile 烘焙與模擬擷取

新增 `lib/profiles/`（`builtin.js` 靜態資料、`baked-keyframes.js`／`sim-capture.js` 由 `npm run bake:profiles` 產生，`scripts/bake-profiles-lib.mjs`＋`server-only-hook.mjs`），經 `sync:legacy` 同步並掛 `RFA.profiles`。`evaluateProfileAngles` 移到 `lib/player`（只看關鍵幀，無則 `null`），刪除 `lib/core/keyframes.js`。舊 UI：`RUNNER_PROFILES` 由 `initRunnerProfiles()` 建立；無本地運動學退回，缺關鍵幀時不畫骨架並提示；`getActiveRunnerTiming` 改唯讀 `getActiveProfileTiming`（`pullPct` 不再漂移）；`renderSimVideo` 走關鍵幀；模擬擷取改上傳 60 幀合成 landmarks 到 `/api/analyze`（原型 S1–S7 通過：172／auto 步頻 166、GCT 257、總分 35）。Server 零變更，temp-core 與部署防線保留（仍不可部署）。同步決策文件、契約、privacy、README、路線圖。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 214 通過，基準 103／361ms／96 不變；改 `builtin.js`／不同步 `lib/profiles` 分別使 P1／B1 失敗並已還原；`.next/static` 無核心字串；`VERCEL=1` build 仍失敗；Playwright：evalCycle 與搬遷前最大差 1.4e-14、模擬擷取 1 個 POST／101 幀關鍵幀／步頻 166、500 錯誤提示與按鈕復原、`pullPct` 不漂移、walk 樣本 103／361ms／96 且顯示缺關鍵幀提示。Opus review：發現即時同步＋無關鍵幀時軌跡取樣會對 `null` 丟錯，已修並加 F5 測試；文件同步缺漏已補。未驗：影片擷取回歸、429／逾時、壞關鍵幀 warn 文案、即時同步情境未在瀏覽器實測。已知：3.5–3.7 期間舊格式匯入檔不顯示骨架（3.7 由 derive 補）。Spec: `context/features/3-5-profile-baking-sim-capture.md`。

### 2026-11-12 — Feature 3.6: 衍生值 API

契約升 1.1.0：`metrics` 新增選填 `gct`（`computeGctMetrics` 完整物件，原樣輸出），其餘欄位與數值不變。新增 `lib/server/metrics.js`（`buildMetrics`，analyze／derive 共用）與 `POST /api/derive`（`derive.js`、`validate-derive-request.js`、`app/api/derive/route.js`）：輸入 `summary`／`cadence`／`heightCm`／`cameraMode`／`includeKeyframes`，回 `metrics`、`phaseTiming`、`stride`、`autoStrideMeters`、選擇性 101 幀 `cycleKeyframes`；body 上限 16 KB、未知欄位 400、無 422、500 只 log `derive failed`。`http-handler.js` 抽出 `handleJsonPost`（analyze 行為不變）；`lib/core/index.js` 9 → 12 個名稱。與 analyze 共用每 IP 限流（使用者確認）；`public/js/config.js` 維持 1.0.0 待 3.7。只動 Server，Client 與 temp-core 不動，仍不可部署。同步契約、server-api、privacy、決策文件、路線圖、README。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 281 通過（原 214），基準 103／361ms／96 與三份 landmarks 193／176／150 不變，`kf-walk-101`／`kf-hsu-101` 與 derive 輸出逐字相同；curl derive 200／403／415／400／405／204／413、`includeKeyframes` 101 幀；`.next/static` 無 derive 相關字串；`VERCEL=1` build 仍失敗；Playwright console 0 error。Opus review：程式正確，已補 S2／S3／S6／A4、去除 R8 空轉防護等測試缺口。未驗：影片／模擬擷取的瀏覽器實測、第 31 次 429 的 curl 實測、修改前後 analyze 的 scratchpad 比對與 temp-core 探針（以逐值測試替代）。給 3.7：`phaseTiming` 只在匯入時採用、`NaN`→`null` 差異、手動調整需 debounce、`public/js/config.js` 升 1.1.0。Spec: `context/features/3-6-derive-api.md`。

### 2026-11-12 — Feature 3.7: Client 改讀衍生值並移除 temp-core

新增 `lib/client/`（`buildDeriveBody`／`deriveKey`／`buildImportSummary`／`checkImportInputs`，經 `sync:legacy` 同步並掛 `RFA.client`）與 `public/js/derive.js`（`scheduleDerive`：手動步頻 debounce 400 ms、序號丟棄過時回應、逐 profile 記憶、記憶鍵排除 `summary.strideMeters`）。UI 9 處本地核心呼叫改讀 `/api/derive`（遙測、總分、GCT、狀態牌、波形、機位／身高／重設自動／手動步頻、擷取完成 1 次 derive）；匯入先前置檢查（步頻不在 (0, 400] 或數值絕對值 > 1000 拒絕並 alert），再 derive 取正規化 `phaseTiming`（全專案唯一寫回處）與缺少時的骨架，失敗不改狀態；匯出改 1.1.0 並帶 `metrics`。刪除 `public/legacy/temp-core/`、四個 script、`VERCEL` 部署防線與 lint 忽略；Server 零變更。改寫過渡期測試，新增 `tests/client-modules.test.js`（L／K 組）；同步 AGENTS、README、契約、server-api、privacy、boundary、路線圖（3.7 done，可進 4.1）。

驗證：lint、build、`VERCEL=1` build 通過；`REQUIRE_BASELINE=1 npm test` 305 通過，基準 103／361ms／96 不變，K1 walk 樣本 derive 補出的關鍵幀與 `kf-walk-101` 逐字相同；Playwright 前後對照 2 profile × 22 情境 × 17 元素 0 差異，匯入 6 樣本數值相同（walk／client 檔新增骨架為刻意），壞檔、429、斷線、快速切換、模擬擷取（166／257ms／35）皆符合。Opus review：可 complete，已修 abort 誤報逾時、applyStride 遺失、擷取沿用舊快取、記憶鍵失效、淡化範圍。事故：清理暫時 worktree 時 node_modules 被波及，已 `npm ci` 還原（鎖定檔無變動）。未驗：woman03 影片擷取、拖入影片、第 31 次 429；無快取時遙測整段提早 return、`AGENTS.md`「版本設定」順手去掉「過渡期」。Spec: `context/features/3-7-client-derive-remove-temp-core.md`。

### 2026-11-12 — Feature 3.8: 報告匯出

舊專案 Feature 3.1 搬入 `public/js/report.js`（`openReport`／`closeReport`，`window.print()` 另存 PDF），啟用「📄 匯出報告」按鈕；列印樣式沿用 `main.css`。資料只讀：GCT 取 `getActiveDerived().metrics.gct`、相位取 `getActiveProfileTiming()`，匯出前以 `isDerivedCurrent`＋`deriveStatus` 把關（更新中或失敗則 alert 拒絕）；報告不發請求、不寫快取、不含核心公式，Server 零變更、無新依賴。跑步報告含基本資訊、四相位骨架圖、評分、7 大指標、GCT；行走只放基本資訊與一張骨架圖。新增 `tests/legacy-client.test.js` R1–R5；同步路線圖、boundary、privacy、README。報告標題預設印出影片檔名（可改暱稱、不上傳）。Spec: `context/features/3-8-report-export.md`。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 310 通過（原 305）；Playwright（獨立 chromium）console 0 error、無 4xx，開報告 0 請求、數值與主畫面一致、列印媒體樣式與 PDF 排版正常、walk 樣本只有 1 張骨架、derive 延遲時拒絕匯出、圖層狀態與標題還原。Opus review：修了建報告失敗會留下無法關閉空浮層、未使用變數、R2 偏寬鬆與文件過期敘述。未驗：P5（client-*.json、模擬擷取、影片擷取後匯出）、P9 完整互動、實體列印對話框、derive 429、建報告失敗路徑實測。待使用者確認：預設印出影片檔名。

### 2026-11-12 — Feature 4.1: Vercel 設定與驗證

新增 `vercel.json`（只含 `regions: ["hnd1"]`，區域不能用已 deprecated 的 `preferredRegion`）、兩個 API route 的 `maxDuration = 10`（本地 3000 幀實測最大 209 ms）、`scripts/smoke-test.mjs` 與 `npm run smoke`（只用內建 `fetch`，對本地或部署網址跑同一套 18 項 HTTP 檢查，另有 `--rate-limit`、`--expect-region`、`--base-url`、`--timeout`）、`docs/deployment.md`（使用者操作清單、平台限制如實說明、部署實測紀錄表初始為「尚未部署」）與 `tests/deploy-config.test.js`（V1–V4，含假 fetch 驗證 runner 判斷）。不需任何環境變數；`lib/`、`public/`、`next.config.mjs` 零變更，無新依賴。同步 README、server-api、privacy、路線圖。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 328 通過（原 310），基準 103／361ms／96 不變；production 本地 smoke 18 PASS，`--rate-limit` 累計第 31 次 429；三個故意改錯（`vercel.json` 改 `iad1`、刪 `maxDuration`、缺安全標頭的 build）均被抓到並還原；Playwright（獨立 chromium）console 0 error、無 4xx、切 Profile 觸發 derive 200。Opus review：可 complete，已修 G1 只比 Function 區域、R2 對照組、A13 連線中斷改 INFO、R1 非 200／429 FAIL 與參數驗證。未驗：實際部署與部署後 smoke（使用者操作，結果補進 `docs/deployment.md` 第 10 節）、影片擷取等互動、平台 413 與 `x-vercel-id` 只有假 fetch 測試、Vercel 是否重複附加安全標頭。待使用者決定：公開部署前是否先處理第三方 CDN 釘版與頁面安全標頭（另開 Feature）、是否把正式網址寫進 repo（預設不寫）。需先自行 push 程式到 GitHub 才能在 Vercel 偵測到 Next.js。Spec: `context/features/4-1-vercel-config-verification.md`。

### 2026-11-12 — Feature 5.1: 手機版 UI

舊頁面 RWD，不引入框架與依賴、Server 零變更。`main.css` 末端單一區段（只用三個 `screen` 媒體查詢、全 id 選擇器），區段外逐字不變（W3 雜湊把關）；觸控目標 ≥ 44px、input 字級 16px、手機 header 不黏頂、影片 HUD／骨架圖例移出畫布、相位按鈕兩欄、報告浮層手機樣式（列印不受影響）。`renderer.js` 以邏輯尺寸 700×480／720×150＋依顯示寬與 devicePixelRatio 放大 backing store（DPR 1 桌面不變），`report.js` 截圖固定 700×480；`ui.js` 骨架畫布 touch／pen 水平拖曳換格（滑鼠不處理）、影片解碼失敗提示並清除壞 `src`；觸控裝置另顯示「📹 拍攝影片」（`capture="environment"`）。新增 W1–W10 靜態測試；同步 README、privacy、deployment、路線圖。Spec: `context/features/5-1-mobile-ui.md`。

驗證：lint、build 通過；`REQUIRE_BASELINE=1 npm test` 343 通過（原 333），基準不變；四個故意改錯均被抓到並已還原；Playwright 390×844／360×740／768×1024／844×390 無橫向溢出、控制項 ≥ 44px、觸控水平拖 100px 換格約 +29%、垂直拖與單點不動、桌面滑鼠拖不動、桌面 backing 700×480／720×150、報告圖 naturalWidth 700、假 mp4 觸發 onerror、woman03 擷取 analyze／derive 200、console 0 error。Opus review：可 complete，已修首次 ResizeObserver 回呼丟錯、壞 src 殘留、pinch-zoom、多指覆寫、橫幅輸入字級、測試寬鬆。未驗：P12 畫布 `toDataURL` 與 main 雜湊比對、列印／PDF、實機（規格第 9 節，交使用者）；規格第 16 節採預設。
