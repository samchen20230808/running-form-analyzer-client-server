# Current Feature: 5.3 手機版三區殼層

## Status

In Progress

## Goals

- Logo 區：手機 2 行（icon＋標題＋版本徽章），`#navSubtitle` 與 banner hero 只在非手機版出現。
- 常駐操作區 `#mobileBar`（sticky、3 行）：身高／步幅／步頻／配速；目前分析影片（`#profileSelect`）＋上傳影片＋載入 JSON；主題切換「核心一｜核心二｜分析」。
- 主題區：核心一／核心二一次顯示一個；「分析」捲到分析區，分析區可下捲；匯出 JSON／報告放到分析區頂端，主題專屬控制項跟著主題。
- 步幅「改回 AI 自動」改為點 `#strideChip` 彈出的小面板，操作後自動收起。
- `public/js/mobile-shell.js` 用 `matchMedia` 搬移既有節點（ID 不變），回到桌面搬回原位；既有 JS 零修改。
- 桌面（≥ 640px）逐項不變；M 組靜態測試、Playwright S1–S11 通過。

## Notes

- Spec：`context/features/5-3-mobile-shell.md`（第 12 節：sticky 範圍採預設整塊 `#mobileBar`，影片區太擠才退到只 sticky 第 3 行）。
- 分支：`feature-mobile-shell`。

**Baseline（改前）**：`npm run build` 成功；`REQUIRE_BASELINE=1 npm test` 343 通過（walk 103／361ms／96；三份 landmarks 193／176／150）。

**實作差異**：`#analysisAnchor` 併入 `#analysisActions`；header 步幅群組與 banner 於手機整塊隱藏（`data-shell="on"` 由 JS 設定，桌面移除）；上傳／載入 JSON 標籤手機顯示短字「影片」「JSON」；第 1 行輸入框視覺 28px，點整格（約 48px）聚焦輸入。測試新增 describe「M 5.3」M1–M5，調整 W2、W6。

**驗證**：build、lint 通過；`REQUIRE_BASELINE=1 npm test` 348 通過，基準不變；兩個故意改錯均被抓到並已還原。Playwright（390×844／360×740／768×1024／1440×900）：三區順序正確、無橫向溢出、console 0 error；核心一／二切換、分析鍵捲動與高亮、步幅彈出面板（開／改回 AI 自動後收起／Esc）；視窗 1440↔390↔768 縮放節點搬移冪等；woman03 影片擷取 analyze／derive 200；匯入 walk JSON 步頻 103、報告步頻 103 spm。

**Opus review 後修正**：chip 改讀 `isManualStride`（機位「手動鎖定」文案也含「手動」會誤判）；分析高亮改 scroll＋rAF（IntersectionObserver 往下捲會回跳）；`scroll-margin-top` 改依 `#mobileBar` 實際高度（CSS 備援 176px）；chip 觸控區縮到標籤列、不再蓋住步幅輸入；補 `addListener` 退路、chip `aria-label`、身高輸入框邊框一致；popover 由 `role="dialog"` 改 `group`（不做焦點陷阱）。

**未做／差異（如實記錄）**：規格 5.4「核心一工具列手機密度整理」未實作（沿用 5.1 排版，實測可用）；搬移的是 `#profileSelect`（非 `#profileSelectGroup`）；手機隱藏 `#dashBanner` 連帶看不到 km/h（`#topSpeedVal`）與步頻評語徽章；數字輸入框視覺 28px（以點整格聚焦補足，S10 對輸入框為例外）；M 組無 jsdom 行為測試與 class diff 自動防線（以人工 diff 確認無既有 class 變更）。

**已知／未驗**：常駐區高 163px（略高於目標 150）；實機（鍵盤彈出時 sticky、iOS／Android）待使用者驗；列印／PDF 未改。


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
