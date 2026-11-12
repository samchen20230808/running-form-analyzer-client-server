# Current Feature: 3.5 內建 profile 烘焙與模擬擷取

## Status

In Progress

## Goals

- 新增 `lib/profiles/`（`builtin.js`、`baked-keyframes.js`、`sim-capture.js`、`index.js`），內建 profile 靜態資料與 101 幀烘焙關鍵幀為單一來源
- `scripts/bake-profiles.mjs`（`npm run bake:profiles`）產生烘焙檔；Vitest 逐字比對「烘焙檔 == 核心重算」
- `lib/player` 新增只看關鍵幀的 `evaluateProfileAngles`（無則 `null`）；刪除 `lib/core/keyframes.js` 退回分支
- UI：`RUNNER_PROFILES` 由 `RFA.profiles` 建立；缺關鍵幀時不畫骨架並提示；`getActiveRunnerTiming` 改唯讀 `getActiveProfileTiming`（消除 pullPct 漂移）；`renderSimVideo` 走關鍵幀
- 模擬擷取改上傳預先烘焙的合成 landmarks 到 `/api/analyze`（先做原型關卡，通過 S1–S7）
- Server 零行為變更；基準 103／361ms／96 與三份 landmarks 樣本不變；temp-core 與部署防線保留（仍不可部署）

## Notes

- Spec: `context/features/3-5-profile-baking-sim-capture.md`（第 14 節採預設；第 15 節三項採建議預設：接受舊格式暫無骨架、不改 AGENTS.md、同意新增 npm script）
- Baseline（動手前）：`npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 188 通過（walk 103／361ms／96；三份 landmarks 不變）；內建三個 profile 在 p=i/100 的 evalCycle 輸出已存 `.temp/pre-3-5-evalcycle.json`。
- 原型關卡（用正式產生程式）：S1–S7 全部成立；172／auto：步頻 166、GCT 257／飛行 104、總分 35、isWalking false、60 幀全接受、請求約 46 KB；與舊本地模擬（158／35）同量級。參數照規格（60 幀、30 fps、髖部不動、isManualDirection true），無調整。
- 第 14 節採預設（.js 產生檔、server-only hook、getActiveProfileTiming、刪除 lib/core/keyframes.js、合成參數）；第 15 節採建議預設（舊格式匯入暫無骨架、不改 AGENTS.md、新增 npm script bake:profiles）。
- 驗證：lint 無錯誤；build 成功；`REQUIRE_BASELINE=1 npm test` 213 通過（含新 profiles-bake P1–P5、F 組），基準不變；改 builtin.js 一個數值 → P1 失敗，改 lib/profiles 不同步 → B1 失敗（皆已還原）；`npm run bake:profiles` 重跑無差異。HTTP：`/` 307→/index.html；modules/bridge.js、profiles/*.js 皆 200 JavaScript；同源 POST /api/analyze（合成 landmarks）200，步頻 166。`.next/static` 核心字串（BAKED／SIM／generatePoseMethodAlignedCycle／評分字串）零命中；`VERCEL=1` build 仍失敗（仍不可部署）；lib/server、lib/contract、lib/landmarks、app、temp-core、next.config.mjs 零差異。
- Playwright：載入無 console error（Tailwind CDN warning 除外）；RFA.profiles 存在且 summary 凍結、RUNNER_PROFILES 三者皆 101 幀關鍵幀且為複本；evalCycle 與搬遷前基準最大差 1.4e-14；B2 改身高後 hsu 骨架不變；B3 模擬擷取恰好 1 個 POST（60 幀、無 profileName）→ custom_captured 帶 101 幀、步頻 166；模擬 500：alert 文案正確、按鈕復原；B4 pullPct 40 匯入後固定 60（切換 5 次、等 3 秒不漂移）；B5 walk 樣本 103／361ms／96，畫布顯示缺關鍵幀提示，console.info 提示；B6 預覽 hsu 剪影與 HUD 正常。
- 未驗：影片拖入／選擇的擷取回歸（無影片檔）、429／逾時模擬、B6 walk 預覽的 HUD「—」、壞 cycleKeyframes 匯入的 warn 文案、切換 Profile 的完整互動只抽樣。
- 注意：Playwright 的 chrome profile 被殘留程序鎖住，已結束殘留的 playwright-mcp chrome 程序後重開。

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
