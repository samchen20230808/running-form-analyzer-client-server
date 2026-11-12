# Current Feature: 3.7 Client 改讀衍生值並移除 temp-core

## Status

In Progress

## Goals

- 新增 `lib/client/`（`buildDeriveBody`、`buildImportSummary`、`checkImportInputs`、`deriveKey`），經 `sync:legacy` 同步並以 `RFA.client` 橋接
- 新增 `public/js/derive.js`（`scheduleDerive`／`postDerive`／`applyDerivedResult`／`getActiveDerived`／`isDerivedCurrent`）
- UI 9 處 temp-core 呼叫改讀 `/api/derive` 快取；觸發點（載入、切 profile、機位、身高、重設自動、手動步頻 debounce 400 ms、擷取完成、匯入）改呼叫 `scheduleDerive`
- 匯入（D7）：前置檢查 → derive（必要時 `includeKeyframes`）→ 成功才建 profile；`phaseTiming` 只在匯入時寫回
- 匯出 schemaVersion 1.1.0 並帶 `metrics`
- 移除 `public/legacy/temp-core/`、四個 script、`next.config.mjs` 的 `VERCEL` 防線、lint 忽略；改寫過渡期測試
- Server 零變更；基準 103／361ms／96 與三份 landmarks 193／176／150 不變
- 文件同步（含 AGENTS.md 過渡期條目改寫）

## Notes

- Spec: `context/features/3-7-client-derive-remove-temp-core.md`
- 使用者決定：首次載入等 derive、不烘焙；壞檔拒絕並 alert；AGENTS.md 一併改寫；限流共用維持。其餘第 13 節採建議預設。
- Baseline（改動前，master adbb013）：`npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 281 通過（基準 103／361ms／96；193／176／150）。
- 實作已完成（`lib/client/`、`public/js/derive.js`、UI 9 處改讀 derive、匯入／擷取／匯出、temp-core 與 `VERCEL` 防線移除、測試改寫與新增 `tests/client-modules.test.js`、文件同步）。
- 已驗證（node_modules 損毀前）：lint 無錯誤；`npm run build` 與 `VERCEL=1 npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 303 通過（含 K1：walk 樣本 derive 補出的關鍵幀與 `kf-walk-101` 逐字相同、361／96）；`.next/static` 與 `public/` 無核心 marker；Server 目錄 `git diff` 為空；curl：`/` 307、`/index.html`／`/js/derive.js`／`/modules/client/index.js` 200、`/legacy/temp-core/biomechanics.js` 404。
- Playwright 前後對照（舊 master worktree vs 新）：2 個 profile × 22 情境（載入、切 profile、三種機位、重設自動、身高 160／190、手動步頻 150、手動步幅 1.10）× 17 個元素，0 差異；匯入 6 個樣本（walk、三份 client、kf-walk、kf-hsu）數值相同，僅 walk 與 client 檔多出骨架關鍵幀（刻意，6.9 #5），每次匯入 2 次 derive；cadence 500 壞檔 alert 且不發 derive；429 顯示「請求過於頻繁，請 12 秒後再試」後綴、數值保留、恢復後正常；匯入時 derive 斷線 alert 且 profile 未新增；快速連續切換只套用最後一個 profile；模擬擷取 analyze＋derive 各 1 次，步頻 166／GCT 257／總分 35；匯出檔名正常。
- 事故與復原：移除暫時 worktree（含 node_modules junction）時 node_modules 被波及；使用者停掉 dev server 後以 `npm ci` 依鎖定檔還原，`package.json`／`package-lock.json` 無變動。
- 最終驗證：`npm run lint` 無錯誤；`npm run build`、`VERCEL=1 npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 305 通過；基準 103／361ms／96 不變。
- Opus review：可 complete。已修：匯入的 derive 被一般 derive 中止並誤報逾時（改為 `postDerive(body, signal)` 各自管理）；被取代請求遺失 `applyStride`（`inflightApplyStride` 併入）；新擷取沿用舊 `custom_captured.derived`（擷取時刪除）；記憶鍵排除 `summary.strideMeters`（不求骨架時回應與它無關），手動步幅／自動步幅寫回不再使快取失效，Playwright 確認切回 profile 不重送；「更新中」淡化範圍補上 `#diagnosticCardsContainer`、`#overallScoreNum`；文件空格與 privacy 補各操作消耗次數。已知差異：無快取時遙測整段提早 return（角度、配速、診斷卡不更新，規格 §6.4 寫只更新不依賴的部分）；debounce 期間較早請求回來會讓「更新中」後綴提早消失；`AGENTS.md`「版本設定」順手拿掉「過渡期」字樣。
- 未驗：影片（woman03）擷取與拖入影片、第 31 次 429 實測。

## History


<!-- STAY vs MOVE rule:
     - TODAY's entries → stay here in current-feature.md
     - PREVIOUS days' entries → move to context/history/project-history.md (append at bottom)
     Never write today's date entries into project-history.md.
     Order: oldest entry first, newest entry last (append new entries at the bottom).
-->

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
