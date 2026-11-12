# Current Feature: 3.6 衍生值 API

## Status

In Progress

## Goals

- 契約 1.1.0：`APP_CONFIG.analysisSchemaVersion` 升 `1.1.0`，`metrics.gct` 為 `computeGctMetrics` 完整物件（原樣輸出）
- 新增 `lib/server/metrics.js` `buildMetrics`，analyze／derive 共用
- 新增 `POST /api/derive`（`derive.js`、`validate-derive-request.js`、`app/api/derive/route.js`），16 KB 上限、未知欄位 400、`includeKeyframes` 選填
- `http-handler.js` 抽出共用 `handleJsonPost`，`handleAnalyzeHttp` 行為不變
- `lib/core/index.js` 9 → 12 個名稱
- 只動 Server；`public/**`、temp-core 不動，仍不可部署
- 測試 A／R／K／H／S 組；文件同步

## Notes

規格：`context/features/3-6-derive-api.md`。未決事項採建議預設：derive 與 analyze 共用限流；`public/js/config.js` 版本號待 3.7 再升（待使用者確認）。

### Baseline（改動前）

- `npm run build` 成功（route：`/api/analyze`）
- `REQUIRE_BASELINE=1 npm test`：11 檔 214 通過

### 驗證（實作後）

- `npm run lint`、`npm run build` 通過（route 清單出現 `ƒ /api/derive`）
- `REQUIRE_BASELINE=1 npm test`：277 通過（原 214）；基準 103／361ms／96、三份 landmarks 193／176／150（66／90／75）不變；`kf-walk-101`／`kf-hsu-101` 與 derive 輸出逐字相同
- `/api/analyze`：`schemaVersion` 1.1.0，`metrics` 多 `gct`（woman03 `rating: good`、193、總分 66），其餘值不變
- curl（既有 dev server，3001）：derive 200（361／96、5 個安全標頭、無 CORS）、`includeKeyframes` 101 幀、cross-site 403、text/plain 415、`{"cadence":180}` 400、GET 405（no-store）、OPTIONS 204、17 KB 413
- `.next/static` 無 `derive failed`／`computeStrideForCameraMode`／`strideModeText`／`buildMetrics`／`validateDeriveRequest`；禁改範圍 `git diff` 為空；`VERCEL=1` build 仍失敗；`sync:legacy`、`bake:profiles` 後內容無差異（僅行尾，已還原）
- Playwright：`/index.html` console 0 error
- 未驗：UI 模擬擷取與影片擷取的實際 POST（該按鈕是「預覽徐國峰標準動作」，未找到觸發 API 的入口，Client 本 Feature 未改）；31 次共用限流只由單元測試 H7 驗證，未用 curl 實測
- 決策：限流與 analyze 共用（使用者已確認，3.7 加 debounce 後再評估是否獨立計數）；`public/js/config.js` 維持 1.0.0 待 3.7（規格建議預設，待使用者確認）

### Opus review 後修正

- review 結論：程式正確；補強測試缺口後可 complete。已補：S2（兩個 route 只 import http-handler）、S3（derive／metrics／validate-derive-request 的 import 白名單）、S6（`public/` 不含 `/api/derive`，3.7 移除）、A4（1.1.0 驗證案例）、R8 去掉靜默防護並補 `phaseTiming`／`stride`／`autoStrideMeters` 比對、R6 補徐國峰分支與 `isWalking`、K1 改完整 `toStrictEqual`、R1 補 `Infinity`；同步過時註解、契約 §3、boundary 呼叫端欄位、server-api 驗證說明
- 補強後 `REQUIRE_BASELINE=1 npm test` 281 通過、lint 無問題
- 未做：規格驗收要求的「修改前後 analyze 結果」scratchpad 比對與「對 temp-core 實際擷取」探針；改以逐值測試（K 組、baseline 測試的 `metrics` 去掉 `gct` 後與基準相同）替代

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
