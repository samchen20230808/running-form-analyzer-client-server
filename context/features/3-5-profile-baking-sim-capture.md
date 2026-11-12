# Feature 3.5 — 內建 profile 烘焙與模擬擷取

## Status

`planned`（第 14 節採建議預設即可開工；第 15 節未決事項待使用者回答，不阻擋開工）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

落實 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) 的 **D2、D3、D4、D9**，並修掉第 9 章兩項既有缺陷（`getActiveRunnerTiming` 的 `pullPct` 漂移、`renderSimVideo` 繞過關鍵幀）：

1. **D3**：內建 profile 的靜態資料（`name`、`cadence`、`appearance`、`summary`）搬到非 server-only 的 `lib/profiles/`，作為單一來源。另附**離線烘焙**的 101 幀 `cycleKeyframes`，由烘焙腳本用核心產生，Vitest 斷言「烘焙檔 == 核心重新計算」。
2. **D1／D2**：拆分 `evaluateProfileAngles`。瀏覽器版放在 `lib/player/`，只看關鍵幀，沒有關鍵幀時回傳 `null`。`lib/core/` 的退回分支整個刪除。UI 在缺少關鍵幀時**不顯示骨架並提示**。
3. **D4**：UI 不再呼叫 `evaluateProfileCycle`。`getActiveRunnerTiming` 改為唯讀取值，不呼叫 `computePersonalizedPhaseTiming`、不改寫 summary，`pullPct` 漂移因此消失。
4. **D9**：無影片的模擬擷取改為送出一份**預先烘焙的合成 landmarks**，走 `POST /api/analyze`，不再在本地合成角度、也不在本地分析。**這一步先做原型，通過第 7 節的標準後才實作。**本規格撰寫時已用一次性探針驗證可行（第 7.3 節）。
5. `renderSimVideo`（無影片的徐國峰預覽）改走關鍵幀，與模擬器畫面一致。

**Server 零行為變更**：`lib/server/`、`lib/contract/`、`app/` 不修改。`REQUIRE_BASELINE=1 npm test` 的基準照舊：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150（總分 66／90／75）。temp-core 保留、不修改，部署防線不動，**仍不可部署**。

## 1. 目標與非目標

### 目標

1. 新增 `lib/profiles/`，非 server-only：
   - `builtin.js`：手寫的靜態資料，內容照搬 `public/js/config.js:43–122`。
   - `baked-keyframes.js`：產生檔，內含三個內建 profile 的 101 幀關鍵幀。
   - `sim-capture.js`：產生檔，內含合成 landmarks。
   - `index.js`：轉匯出上面三支，並提供 `createBuiltinProfiles()`。
2. 新增 `scripts/bake-profiles.mjs`（npm script `bake:profiles`），產生上面兩個產生檔。測試會重新計算並逐字比對。
3. 在 `lib/player/` 新增只看關鍵幀的 `evaluateProfileAngles`，並刪除 `lib/core/keyframes.js` 的退回版本。`lib/core/index.js` 的 9 個對外名稱不變。
4. 舊 UI：`RUNNER_PROFILES` 改由 `RFA.profiles.createBuiltinProfiles()` 建立；`evalCycle` 改呼叫 `RFA.player.evaluateProfileAngles`；渲染端處理 `null`；模擬擷取改上傳合成 landmarks；`renderSimVideo` 改用 `profile.evalCycle`；計時改用唯讀函式。
5. 橋接：同步清單加入 `profiles`，`bridge.js` 掛上 `RFA.profiles`。
6. 測試把關：烘焙一致性、合成 landmarks 的分析結果（快照）、UI 不再呼叫被移除的函式、`lib/profiles` 的結構限制。
7. 文件如實更新：決策文件、路線圖、契約、`docs/privacy.md`（模擬擷取改為呼叫 API）、README。

### 非目標

- 契約 1.1.0、`POST /api/derive`、遙測／GCT／總分／步幅改讀 Server（3.6、3.7）。3.5 之後 UI 仍以 temp-core 計算 `computeGctMetrics`、`computeAutoStrideMeters`、`computeStrideForCameraMode`、`calculateOverallRunningScore`，以及匯入時一次性的 `computePersonalizedPhaseTiming`（`buildSafeSummaryFromJSON`）。
- 由 Server 替舊格式匯入檔補關鍵幀（D7，3.6／3.7）。3.5 期間，這類檔案不顯示骨架，只顯示提示（第 6.4 節、第 15 節第 1 點）。
- 移除 temp-core、部署防線，以及 bundle 的完整移除驗收（3.7）。
- 改由 Server 回傳 `lib/profiles` 資料（D3 選項 b／c，不採用）。
- `isWalking`／`isBiomechanicalRunner` 門檻重複（D10）、`fix-walking-hud-foot-label`、React 化、部署與 push。

## 2. 現況盤點

基準：本專案 `master` `c9c71e8`（3.9 完成），工作區乾淨。3.9 起頁面在 `public/` 根目錄，temp-core 在 `public/legacy/temp-core/`（行號為舊行號 +3）。行號以 Grep／Read 取得。

### 2.1 `RUNNER_PROFILES` 與 `evalCycle`

| 位置 | 內容 |
| ---- | ---- |
| `public/js/config.js:43–122` | `RUNNER_PROFILES` 字面值：`hsu_pose_method`（cadence 184）、`night_track_runner`（166）、`custom_captured`（180，佔位）。三者都**沒有** `cycleKeyframes`；`evalCycle`（`:66–68`、`:92–94`、`:118–120`）呼叫全域 `evaluateProfileAngles(this, p)`，也就是 temp-core 的版本 |
| `public/legacy/temp-core/keyframes.js:100–105` | `evaluateProfileAngles`：有關鍵幀就 `sampleCycleKeyframes`，否則 `generatePoseMethodAlignedCycle(p, summary, cadence)`（退回分支） |
| `lib/core/keyframes.js:10–15` | 同一函式的 server-only 版。**`lib/` 內沒有任何呼叫者**（Server 不使用），只供 `tests/legacy-client.test.js:153` 的 C1 比對 |
| `public/js/analyzer.js:460–474` | `importAnalysisJSON` 建立 `json_*` profile，`evalCycle` 同樣呼叫全域 `evaluateProfileAngles` |
| `public/js/analyzer.js:476–490`、`:220–226` | 關鍵幀不合法時 `console.warn("…退回本地運動學")` |

- `hsu_pose_method` 的靜態 `summary`＋`cadence` 與樣本 `.temp/json/kf-hsu-101.json` 的 `summary`／`cadence` **完全相同**。探針實測 `buildCycleKeyframesFromSummary(hsu.summary, 184, 100)` 序列化後與 `kf-hsu-101.json` 的 `cycleKeyframes` **逐字相同**（第 7.3 節），所以烘焙出的 hsu 關鍵幀可以直接以舊專案樣本交叉驗證。
- 頁面首次載入時，三個內建 summary 不會被改寫：`state.js:10` 的 `isManualStride` 初值為 `true`，因此 `updateTelemetryAndDiagnostics`（`index.html:1570–1571`）不寫 `strideMeters`；`:1554` 的 `phaseTiming` 正規化對三者是恆等（`pullPct` 75／82／75 皆 ≥ 68）。換句話說，**首次載入時的骨架 = `generatePoseMethodAlignedCycle(p, 靜態 summary, 靜態 cadence)`**，這正是烘焙的輸入。
- 之後下列操作會改寫**作用中** profile 的 summary／cadence，在退回路徑下會讓內建骨架跟著變：
  - `recalculateStrideForCameraMode`（`index.html:1371`），由 `switchProfile`（`ui.js:198–202`，非手動步幅時）、機位、身高、重設自動等操作觸發；
  - `onManualStrideInput`（`:1390`）；
  - `onManualCadenceInput`（`:1427`）；
  - `updateTelemetryAndDiagnostics` 非手動步幅分支（`:1577`）。

  `strideMeters` 經 `strideBonusDeg` 影響 `tdThigh`（`temp-core/biomechanics.js:291–297`），`cadence < 135` 會切到行走模型（`:180`）。烘焙後內建骨架不再隨這些操作改變（第 6.6 節 B2）。

### 2.2 `evaluateProfileCycle`（D4：UI 不再呼叫）

| 位置 | 用途 |
| ---- | ---- |
| `public/legacy/temp-core/biomechanics.js:390–402` | 定義：不看關鍵幀，一律 `generatePoseMethodAlignedCycle` |
| `public/js/analyzer.js:136–153` | 無影片模擬擷取：以 `night_track_runner` 合成 45 幀角度，`videoTime = i·1.5/45`，再 `setTimeout(finalizeCycleExtraction, 450)` |
| `public/index.html:2063` | `renderSimVideo`：`evaluateProfileCycle(profile, p)`，繞過關鍵幀（第 9 章缺陷） |

`public/js/analyzer.js:196–209` `finalizeCycleExtraction` 的無影片分支：`capturedRawFrames.length >= 8` 時，在本地呼叫 temp-core 的 `analyzeCapturedFrames`，再 `applyCapturedResult(cadence, summary, null)`，結果是 `custom_captured` **沒有關鍵幀**，骨架走退回路徑。

### 2.3 `getActiveRunnerTiming`（D4：唯讀）

- 定義在 `public/legacy/temp-core/biomechanics.js:404–412`：每次呼叫都以 `computePersonalizedPhaseTiming` **改寫** `profile.summary.phaseTiming`。
- 呼叫端（7 處）：`public/js/renderer.js:45`（`drawSimulator`，每影格）、`:618`（`drawWaveform`，每影格）；`public/js/ui.js:206`（`switchProfile`）、`:285`（`jumpToRunnerPhase`）、`:308`（`updateSimPhaseHUD`，播放時每影格）；`public/js/analyzer.js:583`（匯出）。
- 同性質的改寫還有 `public/index.html:1554`（`updateTelemetryAndDiagnostics`：`s.phaseTiming = computePersonalizedPhaseTiming(s, cadence)`）。**只改 `getActiveRunnerTiming` 而不改這行，漂移不會消失**：每次遙測更新都會再加一次 20。
- 漂移機制：`computePersonalizedPhaseTiming`（`temp-core/biomechanics.js:8–23`）在 `phaseTiming.posePct` 是數字時只做正規化，`pullPct < 68` 時改成 `min(85, pullPct + 20)`，不冪等。匯入時 `buildSafeSummaryFromJSON`（`analyzer.js:354–364`）已經正規化一次，之後 `getActiveRunnerTiming` 與 `:1554` 又反覆寫回。`pullPct < 48` 的匯入檔會依 40 → 60 → 80 漂移。
- 所有 profile 的 summary 都帶 `phaseTiming`：內建 profile 寫在字面值裡；`custom_captured` 由 Server 結果帶入（`lib/core/cycle-analysis.js:420`）；`json_*` 由 `buildSafeSummaryFromJSON` 一律補上。因此唯讀取值不需要退回公式。

### 2.4 渲染端對 `evalCycle` 的依賴（`null` 處理範圍）

| 位置 | 用途 | `evalCycle` 回傳 `null` 時 |
| ---- | ---- | ---- |
| `renderer.js:48–50`、`55` | 主角角度 → `solveKinematics` | 必須跳過（`solveKinematics` 讀 `angles.rThigh`，傳入 `null` 會拋錯） |
| `renderer.js:53`、`56`、`66` | 徐國峰虛影與軌跡（`hsu_pose_method`） | 內建 profile 必有烘焙關鍵幀，不會是 `null` |
| `renderer.js:84–95`、`141–161`、`173–206` | 主角軌跡、相位標記、剪影、骨架、`drawBiomechAnnotations`（`:489` 讀 `angles.comOffset`） | 跳過，改畫提示 |
| `renderer.js:209–260` | 觸地／騰空狀態牌（只讀 `computeGctMetrics`） | 照常 |
| `renderer.js:666`、`679`、`691` | 波形：虛影 rKnee、主角 rKnee、主角 rThigh | 主角兩條曲線跳過 |
| `index.html:2059–2077` `renderSimVideo` | 預覽剪影與即時角度 HUD | 跳過，改畫提示，HUD 顯示 `—` |

即時同步（`livePoseOverride`，`renderer.js:46–49`）不經 `evalCycle`，不受影響。

### 2.5 會產生「缺關鍵幀」profile 的路徑（3.5 之後）

| 路徑 | 3.5 之前 | 3.5 之後 |
| ---- | ---- | ---- |
| 三個內建 profile（含 `custom_captured` 佔位，影片載入後 `ui.js:156–161` 會先切到它） | 退回本地運動學 | 烘焙關鍵幀 |
| 影片擷取成功 | Server 關鍵幀 | 不變 |
| 無影片模擬擷取 | 本地分析，無關鍵幀 → 退回 | Server 分析，有關鍵幀 |
| 匯入帶合法關鍵幀的 v1 檔 | 關鍵幀 | 不變 |
| 匯入舊格式或無／不合法關鍵幀的檔案（例如基準 `running-form_captured-2026-10-29-walk.json`，它沒有 `cycleKeyframes`） | 退回本地運動學 | **不顯示骨架並提示**（3.6／3.7 由 derive 補） |
| Server 回傳不合法關鍵幀（實務上不會發生） | 退回 | 不顯示骨架並提示 |

### 2.6 橋接、同步與既有測試的約束

- `scripts/sync-legacy-modules.mjs:10`：`MANAGED = ["player", "landmarks"]`；自我檢查禁止 `server-only`／`node:`、動態 import、side-effect import，並要求 import 落在 MANAGED 目錄內。
- `public/modules/bridge.js:3–5`：只 import `player`、`landmarks`，`window.RFA = Object.freeze({ player, landmarks })`。
- `tests/browser-modules.test.js:11`（`MANAGED`）、`:77–87`（匯出名稱固定）、`:150–158`（`modules/` 目錄清單與 `bridge.js` 的 import 清單）都要配合本 Feature 修改。
- `tests/legacy-client.test.js:153`：C1 比對 `lib/core/keyframes.js` 與 temp-core 的 `evaluateProfileAngles`。本 Feature 刻意讓兩者不同，這一列必須移除。`:177–192`（C3）規定 UI 只能以 `RFA.` 前綴呼叫已搬出的函式，本 Feature 擴充名單。`:86–98`：`fetch(` 全專案只能有一處（`analyzer.js` 的 `/api/analyze`），模擬擷取必須重用同一個 `fetch`。
- `tests/legacy-client.test.js:37–43`：`lib/` 的 `.js` 不得出現 `temp-core`、`public/legacy` 字串，`lib/profiles` 的註解也一樣。
- `tests/core-modules.test.js:21–35`：9 個名稱不變。`:68–71`：`lib/core/*.js` 第一行必須是 `import "server-only";`。
- `tests/privacy-docs.test.js:28–54`：`lib/**` 不得有 `console.`、`process.env`、`fetch(` 等，`lib/profiles` 自動納入檢查。
- `node_modules/` 沒有 `server-only` 套件（Next 內建處理，Vitest 用 `vitest.config.mjs` 的 alias 指到 stub），所以**純 `node` 無法直接 import `lib/core/`**，烘焙腳本需要處理這一點（第 6.2 節）。`package.json` `engines.node` 為 `24.x`。

## 3. Next.js 16.4.6 查證

本 Feature 不新增路由、不改 `next.config.mjs`、不用新的 Next API。`public/modules/profiles/**` 與 3.4 的 `public/modules/**` 一樣，原樣以靜態檔提供（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`）。start 時仍須依 AGENTS 重讀該頁，確認沒有新的 deprecation。

## 4. 範圍

```
lib/
  profiles/
    builtin.js           # 新增（手寫）：BUILTIN_PROFILE_KEYS、REFERENCE_PROFILE_KEY、SIM_CAPTURE_SOURCE_KEY、BUILTIN_PROFILES（照搬 public/js/config.js:43–122 的資料，不含 evalCycle；深度凍結）
    baked-keyframes.js   # 新增（產生檔）：BAKED_CYCLE_KEYFRAMES = { hsu_pose_method, night_track_runner, custom_captured }
    sim-capture.js       # 新增（產生檔）：SIM_CAPTURE_REQUEST = { frameWidth, frameHeight, runDirection, isManualDirection, frames }＋SIM_CAPTURE_META
    index.js             # 新增：轉匯出＋createBuiltinProfiles()
  player/
    keyframes.js         # 修改：新增 evaluateProfileAngles（只看關鍵幀，無則 null）
    index.js             # 修改：轉匯出 evaluateProfileAngles
  core/
    keyframes.js         # 刪除（見 6.3）
    keyframes-builder.js # 修改：常數改 import 自 ../player/keyframes.js（只改 import 行）
    index.js             # 修改：CYCLE_KEYFRAME_NUMERIC_FIELDS 改自 ../player/keyframes.js 轉匯出
  config.js              # 修改：只改檔頭註解第 4–5 行（RUNNER_PROFILES 已搬到 lib/profiles）
scripts/
  bake-profiles.mjs          # 新增：CLI，寫兩個產生檔
  bake-profiles-lib.mjs      # 新增：純產生邏輯（renderBakedModules），CLI 與測試共用
  server-only-hook.mjs       # 新增：node --import 用的 resolve hook，把 server-only 指到空模組（只給 scripts 用）
  sync-legacy-modules.mjs    # 修改：MANAGED 加 "profiles"
public/
  modules/
    bridge.js            # 修改：import profiles，RFA = { player, landmarks, profiles }
    profiles/            # 新增（同步產物）
    player/              # 更新（同步產物）
  js/config.js           # 修改：RUNNER_PROFILES 改為空物件＋initRunnerProfiles()
  js/state.js            # 修改：新增唯讀 getActiveProfileTiming()
  js/renderer.js         # 修改：getActiveRunnerTiming → getActiveProfileTiming；evalCycle 為 null 時的處理
  js/ui.js               # 修改：getActiveRunnerTiming → getActiveProfileTiming（3 處）
  js/analyzer.js         # 修改：模擬擷取改上傳；刪除本地分析分支；requestServerAnalysis 參數化；json_* 的 evalCycle；warn 文案；匯出用唯讀計時
  index.html             # 修改：DOMContentLoaded 先 initRunnerProfiles()；:1554 唯讀；renderSimVideo 改 evalCycle
package.json             # 修改：scripts 加 "bake:profiles"（不新增依賴）
tests/
  profiles-bake.test.js      # 新增：第 9 節 P
  browser-modules.test.js    # 修改：MANAGED、匯出名稱、evaluateProfileAngles 行為、bridge
  legacy-client.test.js      # 修改：C1 移除 evaluateProfileAngles；C3 擴充；新增 F 組
  core-modules.test.js       # 修改：只新增斷言（lib/core 不定義 evaluateProfileAngles、不再有 keyframes.js）
docs/client-server-boundary.md、docs/planning/epics-and-features.md、docs/analysis-json-contract.md、docs/privacy.md、README.md
context/current-feature.md   # Notes
```

- **不修改**：`lib/server/`、`lib/contract/`、`lib/landmarks/`、`lib/core/{biomechanics,cycle-analysis}.js`、`app/`、`public/legacy/temp-core/`、`next.config.mjs`、`vitest.config.mjs`、`eslint.config.mjs`、`public/js/pose.js`。
- **不新增依賴**。`package.json` 只加一個 npm script（第 15 節第 3 點）。
- 行號：`public/js/*.js` 與 `index.html` 會有增減行；決策文件第 3 章的舊行號以 `e29766d` 為準，不用改，第 4 章「位置」欄改成新位置。

## 5. 實作順序（含原型關卡）

1. **原型關卡（先做，不改專案程式）**：在 scratchpad 寫一次性腳本，依第 7.2 節產生合成 landmarks，跑 `analyzeRequest`，逐條對照第 7.1 節的通過標準，把結果寫進 Notes。**任一條不通過就停下來回報使用者**（第 7.4 節），不要進入步驟 2。
2. 擷取搬遷前基準：在現版頁面（temp-core 退回路徑）用 Playwright，取得三個內建 profile 在 `p = i/100` 的 `evalCycle` 輸出，存到 scratchpad，供驗收第 5 點對照。
3. 新增 `lib/profiles/builtin.js`、`scripts/bake-profiles-lib.mjs`、`scripts/server-only-hook.mjs`、`scripts/bake-profiles.mjs`，執行 `npm run bake:profiles` 產生兩個產生檔；新增 `lib/profiles/index.js`。
4. `lib/player/keyframes.js` 新增 `evaluateProfileAngles`；刪除 `lib/core/keyframes.js`，修改 `keyframes-builder.js`、`index.js` 的 import。跑 `REQUIRE_BASELINE=1 npm test`，確認既有基準全過（Server 零變更檢查點）。
5. `sync-legacy-modules.mjs` 加 `profiles`，執行 `npm run sync:legacy`；修改 `bridge.js`。
6. 修改舊 UI（第 6.4–6.7 節）。
7. 新增或修改測試（第 9 節）；跑 lint、build、test。
8. 依 Verification 做 HTTP 與 Playwright 檢查；更新文件（第 12 節）；把 Notes 寫入 `context/current-feature.md`。

## 6. 設計

### 6.1 `lib/profiles/`：靜態資料與烘焙關鍵幀

- **`builtin.js`（手寫，單一來源）**

  ```js
  export const BUILTIN_PROFILE_KEYS = ["hsu_pose_method", "night_track_runner", "custom_captured"];
  export const REFERENCE_PROFILE_KEY = "hsu_pose_method";     // 虛影／波形參考
  export const SIM_CAPTURE_SOURCE_KEY = "night_track_runner"; // 模擬擷取的合成來源
  export const BUILTIN_PROFILES = deepFreeze({ hsu_pose_method: { name, cadence, appearance, summary }, … });
  ```

  數值、字串、key 順序都照搬 `public/js/config.js:43–122`（`14.0` 這類寫法照原樣，數值相同即可），不含 `evalCycle`。`deepFreeze` 是同檔的小型私有函式。
- **`baked-keyframes.js`（產生檔）**：`export const BAKED_CYCLE_KEYFRAMES = { <key>: plain(buildCycleKeyframesFromSummary(summary, cadence, 100)) }`，三個 key 都產生。檔頭註明「由 `npm run bake:profiles` 產生，請勿手改」。不凍結，由 `createBuiltinProfiles` 複製後使用。
- **`index.js`**

  ```js
  export * from "./builtin.js";
  export { BAKED_CYCLE_KEYFRAMES } from "./baked-keyframes.js";
  export { SIM_CAPTURE_REQUEST, SIM_CAPTURE_META } from "./sim-capture.js";
  // 回傳可改寫的深複本（執行期狀態），每個內建 profile 附上烘焙關鍵幀
  export function createBuiltinProfiles() { … structuredClone … }
  ```

  靜態資料保持凍結，UI 拿到的是複本。這就是 D3「靜態資料不可被改寫（複製後再改）」。
- 產生檔用 `.js` 模組，不用 `.json`：瀏覽器直接載入、沒有 bundler，JSON module 需要 import attributes（`with { type: "json" }`），舊版 Safari／Firefox 支援不一致；`.js` 在 Node、Vitest、瀏覽器三邊行為相同。
- 格式：`export const X = ` 接 `JSON.stringify(data)`，關鍵幀每幀一行、landmarks 每幀一行，方便看 diff。換行一律 `\n`，比對時沿用 3.4 的 CRLF 正規化。
- 大小（探針實測）：每份關鍵幀約 36 KB，三份約 108 KB；合成 landmarks 約 46 KB。`public/modules/profiles/` 合計約 155 KB，靜態快取，可以接受。
- 保護範圍：`lib/profiles` 只有**輸出**（關鍵幀、合成座標），沒有公式。A2 的 server-only 字串掃描同樣適用（第 9 節 B1）。

### 6.2 烘焙腳本與一致性測試

- **`scripts/bake-profiles-lib.mjs`**：匯出 `renderBakedModules()`，回傳 `{ "lib/profiles/baked-keyframes.js": text, "lib/profiles/sim-capture.js": text }`。它 import `../lib/core/index.js`（只走公開入口，與 `lib/server` 的規則一致）、`../lib/player/index.js`（`solveKinematics`）、`../lib/profiles/builtin.js`。純函式、無 I/O、結果可重現：不用 `Date`、`Math.random`，不寫時間戳。
- **`scripts/bake-profiles.mjs`**：呼叫 `renderBakedModules()` 並寫檔，印出檔名與大小。
- **`server-only` 的處理**：`scripts/server-only-hook.mjs` 用 `node:module` 的 `registerHooks`（Node 24 內建），在 resolve 階段把 `"server-only"` 指到 `data:text/javascript,`。npm script 為：

  ```
  "bake:profiles": "node --import ./scripts/server-only-hook.mjs scripts/bake-profiles.mjs && node scripts/sync-legacy-modules.mjs"
  ```

  烘焙後一併同步，避免忘記。這個 hook 只在 scripts 使用，`lib/` 不受影響，正式 build 仍由 Next 處理 `server-only`。替代方案見第 14 節第 2 點。
- 不掛在 `prebuild`／`predev`（與 3.4 的 `sync:legacy` 同一理由）。漂移由 Vitest 偵測，失敗訊息提示 `npm run bake:profiles`。
- **一致性測試**（`tests/profiles-bake.test.js`，永遠執行，不需樣本）：對 `renderBakedModules()` 的每個輸出，`norm(磁碟檔) === norm(text)`。這就是 D3 的「烘焙檔 == 核心重新計算」，而且是逐字比對。另外：
  - 有樣本時（`REQUIRE_BASELINE`／`skipIf` 規則同 `baseline.test.js`），斷言 `JSON.stringify(BAKED_CYCLE_KEYFRAMES.hsu_pose_method) === JSON.stringify(kf-hsu-101.cycleKeyframes)`，與舊專案交叉驗證。
  - 三份關鍵幀都通過 `normalizeCycleKeyframes`，`frames.length === 101`。
  - 在 `p = i/100` 時，`sampleCycleKeyframes` 與 `generatePoseMethodAlignedCycle(p, 靜態 summary, cadence)` 的 12 個數值欄位差 ≤ 1e-9，`*IsStance` 相同（探針：節點誤差 ≤ 4.5e-16）。

### 6.3 `evaluateProfileAngles` 拆分（D1／D2）

- `lib/player/keyframes.js` 新增：

  ```js
  // 渲染層取骨架的單一入口：只看關鍵幀；沒有關鍵幀回傳 null（呼叫端不畫骨架並提示）
  export function evaluateProfileAngles(profile, p) {
    if (!profile || !profile.cycleKeyframes) return null;
    return sampleCycleKeyframes(profile.cycleKeyframes, p);
  }
  ```

  沿用原名，讓決策文件、grep 與呼叫點保持連續。與 temp-core 同名的全域版本由 C3 強制區分：UI 只能用 `RFA.player.evaluateProfileAngles`，未加前綴就失敗。
- **刪除 `lib/core/keyframes.js`**：刪掉退回版本後，這支檔案只剩轉匯出常數，沒有自己的程式。比照 3.4 刪除 `lib/core/landmark-extract.js` 的決定：`keyframes-builder.js:3` 改為 `import { CYCLE_KEYFRAME_NUMERIC_FIELDS } from "../player/keyframes.js";`，`index.js:10` 改為 `export { CYCLE_KEYFRAME_NUMERIC_FIELDS } from "../player/keyframes.js";`。`CYCLE_KEYFRAME_MIN_FRAMES` 原本就沒有從 `lib/core/index.js` 匯出，不受影響。替代方案（保留只有轉匯出的空殼）見第 14 節第 4 點。
- 這樣之後，`generatePoseMethodAlignedCycle` 在 `lib/` 內只剩 `keyframes-builder.js`（Server 產生關鍵幀）與烘焙腳本兩個使用者，D2「骨架模型不交給瀏覽器」在 `lib/` 層成立。頁面上 temp-core 仍載入它，但 UI 不再呼叫（F 組測試），3.7 移除。

### 6.4 UI：`RUNNER_PROFILES` 建立與 `null` 處理

- `public/js/config.js:43–122` 改為：

  ```js
  // 3.5：內建 profile 的靜態資料與烘焙關鍵幀在 lib/profiles（經 modules/bridge.js 的 RFA.profiles）
  const RUNNER_PROFILES = {};
  function attachEvalCycle(profile) {
    profile.evalCycle = function (p) { return RFA.player.evaluateProfileAngles(this, p); };
    return profile;
  }
  function initRunnerProfiles() {
    const built = RFA.profiles.createBuiltinProfiles();
    for (const key of RFA.profiles.BUILTIN_PROFILE_KEYS) RUNNER_PROFILES[key] = attachEvalCycle(built[key]);
  }
  ```

  `index.html:2084` 的 `DOMContentLoaded` 處理函式第一行呼叫 `initRunnerProfiles()`。依 3.4 的實測，module script（`bridge.js`）在 `DOMContentLoaded` 之前執行完畢，所以此時 `RFA` 已經存在。classic script 頂層沒有讀取 `RUNNER_PROFILES` 內容的地方（只有 `config.js` 的宣告，其餘都在函式內），全部的讀取都發生在這之後。
- `analyzer.js:471–473`（`json_*`）改用 `attachEvalCycle`。
- **缺關鍵幀提示（D2 的 UX）**：
  - `drawSimulator`：`activeAngles` 為 `null`（而且沒有即時同步）時，照常畫地面、虛影（若開啟）與狀態牌，**跳過**主角軌跡、相位標記、剪影、骨架、`drawBiomechAnnotations`，並在畫布中央畫兩行提示：「此分析檔缺少骨架關鍵幀，無法顯示動畫」「遙測與診斷數值不受影響」。字型、顏色沿用現有標註樣式。
  - `drawWaveform`：主角的 rKnee、rThigh 兩條曲線跳過，參考虛影曲線照畫。
  - `renderSimVideo`：`a === null` 時畫同一段提示，`liveVideoTrunk`／`Knee`／`Elbow` 顯示 `—`。
  - 不 alert（契約 §2.5 第 4 點：不合法時 `console.warn`，不 alert）。`analyzer.js:225`、`:486` 的 warn 文案從「退回本地運動學」改成「將不顯示骨架」。匯入舊格式檔時另外 `console.info("此檔沒有 cycleKeyframes，骨架不顯示")`，方便除錯。
- 提示只取決於「作用中 profile 沒有關鍵幀」，不另外加狀態旗標。

### 6.5 模擬擷取改用合成 landmarks（D9）

- `analyzer.js:135–154`（`triggerCycleExtraction` 的 `else` 分支）改為：

  ```js
  } else {
    // 3.5：無影片時上傳預先烘焙的合成 landmarks（D9），結果與影片擷取走同一條路
    const sim = RFA.profiles.SIM_CAPTURE_REQUEST;
    isCapturingCycle = false;
    startServerAnalysis(captureSeq, {
      frameWidth: sim.frameWidth, frameHeight: sim.frameHeight,
      runDirection: sim.runDirection, isManualDirection: sim.isManualDirection,
      heightCm: captureStart.heightCm, frames: sim.frames,
    });
  }
  ```

  `startServerAnalysis` 會把按鈕切到「☁️ 上傳分析中…」，然後呼叫 `requestServerAnalysis`。
- `requestServerAnalysis(seq)` 改為 `requestServerAnalysis(seq, req)`：`req` 帶 `frameWidth`、`frameHeight`、`heightCm`、`runDirection`、`isManualDirection`、`frames`；`cameraMode` 照舊取 `selectedCameraMode`。影片路徑由 `finalizeCycleExtraction` 組出 `req`（值與現在相同：`videoCanvas.width/height`、`captureStart.*`、`capturedLandmarkFrames`），送出的 body **逐欄位不變**。`fetch` 仍然只有一處。按鈕「上傳中」的設定抽成 `startServerAnalysis(seq, req)`，影片與模擬共用。
- `finalizeCycleExtraction` 的無影片分支（`:196–209`）整段刪除，包括本地 `analyzeCapturedFrames`。影片幀數 `< 8` 時維持現狀：顯示完成、不上傳（3.3 行為）。
- 錯誤處理、過時回應丟棄（`captureSeq`）、`applyCapturedResult` 全部沿用。模擬結果寫進 `custom_captured`，**帶 Server 關鍵幀**。
- 送出的欄位與影片擷取相同（無 `profileName`、無 z）。`heightCm`、`cameraMode` 取當下 UI 值，與舊模擬擷取一致；`runDirection`／`isManualDirection` 用烘焙值（1／`true`），不讀全域 `runDirection`（第 6.6 節 B3）。
- 行為差異：會打一次 API，所以受限流（30 次／60 秒）、需要網路，延遲是一次往返；舊作法的 450 ms 假延遲移除。

### 6.6 預期的行為變更（全部刻意，驗收時逐條確認）

| # | 變更 | 理由 |
| - | ---- | ---- |
| B1 | 內建骨架改由 101 幀線性內插。節點上與原本相同（≤ 1e-9）；節點之間最大差 **1.14°**（`trunk`，出現在跑步模型 `fallLeanBoost` 的 1.2° 階躍附近，三個 profile 都一樣），`*IsStance` 在 2001 點取樣中零差異（探針） | D3；與 `custom_captured`／匯入檔的既有播放方式一致 |
| B2 | 內建骨架不再隨步幅、身高、機位、手動步頻改變（遙測、配速、動畫速度照舊會變） | 契約 §2.5 第 5 點「帶關鍵幀的 Profile 以關鍵幀為準」；D1／D6 |
| B3 | 模擬擷取的結果改由 Server 計算：探針為步頻 166（舊 158）、總分 35（舊 35）、GCT 257 ms（舊 275）。需要網路、受限流；`runDirection` 固定為 1，不再沿用全域方向；`custom_captured` 改為帶關鍵幀 | D9 |
| B4 | `pullPct` 不再漂移：`pullPct < 48` 的匯入檔固定顯示「原值 + 20」（匯入時正規化一次）。其他檔案、內建 profile、Server 結果的數值不變 | D4；第 9 章缺陷 |
| B5 | 匯入舊格式／無關鍵幀／不合法關鍵幀的檔案時，不顯示主角骨架並提示，遙測數值不變（walk 樣本仍為 103／361ms／96） | D2；3.6／3.7 由 derive 補（第 15 節第 1 點） |
| B6 | `renderSimVideo` 改用作用中 profile 的關鍵幀，與模擬器畫面一致 | 第 9 章缺陷 |

### 6.7 `getActiveRunnerTiming` 唯讀化（D4）

- `public/js/state.js` 新增：

  ```js
  // 3.5（D4）：唯讀取值，不重算、不改寫 summary（消除 pullPct 漂移）
  function getActiveProfileTiming() {
    const profile = RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
    return profile.summary.phaseTiming;
  }
  ```

- 7 個呼叫點（第 2.3 節）改用 `getActiveProfileTiming()`。`index.html:1554–1555` 改為 `const timing = getActiveProfileTiming();`，不再寫回。
- **改名而不是同名覆寫**：temp-core 以全域 `function getActiveRunnerTiming` 宣告，而且不能修改。若在其他 classic script 宣告同名函式，哪個生效取決於載入順序（`state.js`、`ui.js` 在 temp-core 之前，會被覆蓋；`analyzer.js` 在之後，會覆蓋），容易出錯。新名稱加上 F 組測試「UI 不得呼叫 `getActiveRunnerTiming(`」，意圖明確。temp-core 的定義變成死碼，3.7 一併刪除。
- 匯出（`analyzer.js:583`）的 `phaseTiming` 因此是存起來的值。契約 §1 表格（`docs/analysis-json-contract.md:29`）的來源欄改為 `profile.summary.phaseTiming`。

## 7. 合成 landmarks：原型與通過標準（D9）

### 7.1 通過標準（原型與正式測試共用，全部必須成立）

以烘焙出的 `SIM_CAPTURE_REQUEST`，加上 `heightCm: 172`、`cameraMode: "auto"`，呼叫 `analyzeRequest`：

| # | 標準 |
| - | ---- |
| S1 | `ok === true`；請求通過 `validateRequest`；`frames.length ≤ MAX_UPLOAD_FRAMES`（1500）；`JSON.stringify` 後 ≤ 200 KB |
| S2 | 依 Server 迴圈重跑閘門（`extractAnglesFromLandmarks`＋`evaluateCaptureFrame`）：接受幀數達到 `LIMITS.maxAcceptedFrames`（55），前 55 幀沒有 `skip`／`finalize` |
| S3 | `cadence` 與來源 profile（`night_track_runner`，166）相差不超過 ±3；`metrics.isWalking === false` |
| S4 | 結果通過 `validateAnalysisJSON`（`ok`，零 errors、零 warnings），並滿足 `baseline.test.js` 的 `expectProducerContract` 義務（phaseTiming 單調、關鍵幀首尾一致等） |
| S5 | 與舊模擬擷取（現行行為：步頻 158、總分 35）屬同一量級：`overallScore` 與 35 相差不超過 ±10，`summary` 數值都在契約範圍內 |
| S6 | 可重現：同一份輸入連跑兩次，除 `timestamp` 外結果相同；`runDirection` 用手動 1 與自動偵測時，結果相同（不依賴臉部方向啟發式） |
| S7 | `heightCm` 160／190、`cameraMode` `static`／`tracking` 都回 `ok`，`isWalking` 都是 `false`（UI 可能送出的組合不會失敗） |

正式測試（第 9 節 P3）把 172／auto 的完整 `cadence`、`metrics`、`summary` 寫成逐值快照，數值在原型時擷取。

### 7.2 產生方式（烘焙腳本內，純函式）

- 來源：`BUILTIN_PROFILES[SIM_CAPTURE_SOURCE_KEY]`（`night_track_runner`）的靜態 summary 與 cadence。
- 時間軸：`fps = 30`，`n = 60` 幀（2.0 秒，Server 只用前 55 幀，留 5 幀餘量），`t = i / fps`；週期 `period = 120 / cadence` 秒（一個週期兩步），`p = (t / period) mod 1`。
- 角度：`generatePoseMethodAlignedCycle(p, summary, cadence)` → 座標：`solveKinematics(a, W·0.5, 370, 0.95)`，畫面 `W = 640`、`H = 400`（與 `startSimulatedVideoFeed` 的畫布相同）。髖部 x 固定，模擬跑步機或跟拍；與舊模擬的 `midHipX = 320` 相同。
- 對應 33 點 MediaPipe 索引：
  - 0 鼻：頭部 +6 px，朝前；7／8 耳：頭部 −6 px；1–6、9–10：頭部 −4 px；
  - 11／12 肩：同一點；13／14 肘、15／16 腕：左右手臂；17–22：同側腕；
  - 23／24 髖：同一點；25／26 膝、27／28 踝、29／30 跟、31／32 趾：左右腿；
  - `visibility` 一律 0.99。
- 座標正規化成 `x / W`、`y / H`，四捨五入到 5 位小數；`t` 四捨五入到 4 位。
- `SIM_CAPTURE_META` 記錄 `{ sourceProfileKey, cadence, fps, frameCount }`，只供測試與文件使用，不上傳。

### 7.3 撰寫規格時的探針結果（scratchpad 一次性腳本，未提交）

以 7.2 的作法（未四捨五入版與 5 位小數版都測過）：

- 接受 55／55 幀，第 54 幀達上限；自動偵測方向為 1，與手動 1 的結果相同。
- 172／auto：步頻 **166**，`metrics = { gctMs: 257, flightMs: 104, isWalking: false, overallScore: 35 }`，`strideMeters` 0.69。`summary`：`trunkAngle` 4.3、`comOffsetCm` 11.2、`touchdownKnee` 159、`minSwingKnee` 116、`pushOffExtensionDeg` 21.2、`avgElbow` 65、`hipRomDeg` 37。`validateAnalysisJSON.ok` 為 true。請求約 46 KB。
- 172／static 的步幅是 0.08（像素位移為 0；舊模擬同樣是 0.08），172／tracking 是 0.69，160／auto 總分 38，190／auto 總分 35，全部 `ok`。
- 舊模擬擷取（現行行為）：步頻 158、GCT 275／105、總分 35、`trunkAngle` 4、`comOffsetCm` 13.2、`touchdownKnee` 161、`minSwingKnee` 116。
- 加入水平位移（每幀 3 px）會被判成固定機位，`comOffsetCm` 9.2、總分 42。因此建議維持髖部不動。
- `buildCycleKeyframesFromSummary(hsu)` 與 `kf-hsu-101.json` 逐字相同；內插誤差見 B1。

結論：可行，S1–S7 在探針中全部成立。原型關卡仍要在 start 後用正式的產生程式重跑一次（四捨五入、索引對應可能有細節差異）。

### 7.4 原型不通過時

先在 7.2 的參數內調整（`n`、`fps`、站位 x、`groundY`、`scale`），任何調整都記錄在 Notes。若仍有任一條 S 不成立，**停止並回報使用者**，可選方案：

- (a) 放寬該條標準（須說明理由）；
- (b) 模擬擷取暫時停用，按鈕提示「請先選擇影片」，3.5 其餘部分照做；
- (c) 保留本地模擬到 3.7。不建議：違反 D9，而且要保留 `analyzeCapturedFrames` 呼叫。

不得自行改 `lib/landmarks`、`lib/core` 來讓合成資料通過。

## 8. 橋接與同步的影響

- `scripts/sync-legacy-modules.mjs:10`：`MANAGED = ["player", "landmarks", "profiles"]`。自我檢查規則不變；`lib/profiles` 只 import `./`，符合規則。
- `public/modules/bridge.js`：

  ```js
  import * as player from "./player/index.js";
  import * as landmarks from "./landmarks/index.js";
  import * as profiles from "./profiles/index.js";
  window.RFA = Object.freeze({ player, landmarks, profiles });
  ```

  module namespace 本身不可改寫，`BUILTIN_PROFILES` 又已深度凍結，UI 只能經 `createBuiltinProfiles()` 拿到複本。
- 匯出名稱：`RFA.player` 多 `evaluateProfileAngles`（共 7 個）；`RFA.profiles` 為 `BAKED_CYCLE_KEYFRAMES`、`BUILTIN_PROFILES`、`BUILTIN_PROFILE_KEYS`、`REFERENCE_PROFILE_KEY`、`SIM_CAPTURE_META`、`SIM_CAPTURE_REQUEST`、`SIM_CAPTURE_SOURCE_KEY`、`createBuiltinProfiles`。
- 工作流程：改 `lib/profiles/builtin.js` → `npm run bake:profiles`（內含同步）；只改 `lib/player`／`lib/landmarks` → `npm run sync:legacy`。兩者都由測試偵測漂移。
- `.next/static/`：`app/` 沒有 import `lib/profiles`，不會進入 bundle（Verification 第 4 步檢查）。

## 9. 測試計畫

**既有測試**：全部照舊通過，基準不變。`baseline.test.js` 不改；它經 `lib/core/index.js` 取得的 `CYCLE_KEYFRAME_NUMERIC_FIELDS` 與 `buildCycleKeyframesFromSummary` 改由 `lib/player/keyframes.js` 供應常數，baseline 通過就證明 Server 路徑零變更。

**P. `tests/profiles-bake.test.js`（新增，永久）**

1. P1 烘焙一致性：`renderBakedModules()` 的每個輸出與磁碟檔正規化後**逐字相同**，失敗訊息提示 `npm run bake:profiles`。
2. P2 關鍵幀：三份都 `normalizeCycleKeyframes(...).ok`，各 101 幀；節點值與 `generatePoseMethodAlignedCycle` 差 ≤ 1e-9、`*IsStance` 相同；有樣本時 hsu 與 `kf-hsu-101.json` 逐字相同。
3. P3 模擬擷取：第 7.1 節 S1–S7 逐條斷言，加上 172／auto 的 `cadence`、`metrics`、`summary` 逐值快照（`toStrictEqual`），以及 `SIM_CAPTURE_META.sourceProfileKey === SIM_CAPTURE_SOURCE_KEY`。
4. P4 靜態資料：`BUILTIN_PROFILES` 深度凍結（嘗試寫入後值不變）；`createBuiltinProfiles()` 每次回傳新的深複本（改複本不影響第二次呼叫），且三個 key 都帶 `cycleKeyframes`；`BUILTIN_PROFILE_KEYS` 與 `Object.keys(BUILTIN_PROFILES)` 相同。
5. P5 數值逐值對照（start 時用 Read 原 `config.js` 擷取後寫進測試）：三個 profile 的 `cadence` 與 `summary` 各欄位、`name`。確保搬家沒有抄錯。

**B. `tests/browser-modules.test.js`（修改）**

1. B1：`MANAGED` 加 `profiles`，A1 結構檢查、A2 server-only 字串掃描自動涵蓋 `lib/profiles/**`。
2. B2：匯出名稱固定（第 8 節清單）。
3. B3：`player.evaluateProfileAngles`：`{}` → `null`、`null` → `null`；帶 `kf-walk-101` 時等於 `sampleCycleKeyframes` 的結果（有樣本時）。原始碼不含 `generatePoseMethodAlignedCycle`（A2 已涵蓋）。
4. B4：`modules/` 目錄清單為 `bridge.js`＋三個子目錄；`bridge.js` 只 import 三個 `index.js`。B1 同步一致（現有 `:136–148`）自動涵蓋 `profiles`。

**C. `tests/legacy-client.test.js`（修改）**

1. C1：`SOURCES` 移除 `evaluateProfileAngles` 那一列（`:153`），其餘 8 個名稱照舊比對。
2. C3：名單加入 `evaluateProfileAngles`（只能以 `RFA.player.` 呼叫）。
3. 新增 **F 組（3.5 移除的本地解算）**：`public/js/*.js` 與 `index.html` 中，`evaluateProfileCycle(`、`getActiveRunnerTiming(`、`generatePoseMethodAlignedCycle(`、`analyzeCapturedFrames(` 零命中（正則同 C3）；`config.js` 不含 `touchdownKnee`、`phaseTiming`（靜態資料只在 `lib/profiles`）；`index.html` 的 `DOMContentLoaded` 處理函式內，`initRunnerProfiles()` 出現在 `updateTelemetryAndDiagnostics()` 之前；`fetch` 仍然只有一處（現有測試照舊）。
4. C4：markers 不變。`public/modules/profiles/**` 自動納入掃描。

**D. `tests/core-modules.test.js`（只新增）**：`coreFiles` 不含 `keyframes.js`；`lib/core/**` 沒有 `function evaluateProfileAngles`。9 個名稱與型別照舊。

## 10. 驗收標準

1. 第 7.1 節 S1–S7 成立（P3）；原型關卡的結果寫在 Notes。
2. `REQUIRE_BASELINE=1 npm test` 全過，基準不變：walk 103／361ms／96；`kf-walk-101`／`kf-hsu-101` 逐字相同；landmarks woman03 193／193ms／66、walkrun-a 176／192ms／90、walkrun-b 150／230ms／75。P、B、C、D 組全過。
3. `npm run bake:profiles` 執行後 `git status` 沒有差異。故意改 `builtin.js` 一個數值時 P1 失敗；改 `lib/profiles` 卻不同步時 B1 失敗（驗證後還原）。
4. `lib/` 內 `evaluateProfileAngles` 只定義一次（`lib/player/keyframes.js`），而且沒有退回分支；UI 不再呼叫第 9 節 F 組列出的函式。
5. 三個內建 profile 在 `p = i/100` 的 `evalCycle` 輸出與步驟 2 擷取的搬遷前基準相差 ≤ 1e-9（預設狀態，首次載入）。
6. 第 6.6 節 B1–B6 在頁面上逐條確認（Verification 第 6 步）。
7. `git diff --stat -- lib/server lib/contract lib/landmarks app public/legacy/temp-core next.config.mjs` 為空；`VERCEL=1 npm run build` 仍失敗。
8. 文件依第 12 節更新，不宣稱尚未成立的保護。

## 11. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`、`npm run lint`（`lib/profiles` 與 `scripts/` 都受 lint 檢查）。
2. `REQUIRE_BASELINE=1 npm test`，記錄基準數值；另跑一次不帶變數的 `npm test`。執行驗收第 3 點的兩個「故意改錯」檢查，記錄失敗訊息後還原。
3. HTTP（`npm run dev`，`curl -i`）：`GET /` → 307 `/index.html`；`/modules/bridge.js`、`/modules/profiles/index.js`、`/modules/profiles/baked-keyframes.js`、`/modules/profiles/sim-capture.js` → 200，JavaScript MIME；用 `SIM_CAPTURE_REQUEST`＋172／auto 做同源 `POST /api/analyze` → 200，`cadence` 等於 P3 快照，5 個安全標頭不變。
4. **bundle 檢查**（scratchpad 腳本）：`.next/static/` 搜尋 `BAKED_CYCLE_KEYFRAMES`、`SIM_CAPTURE_REQUEST`、`generatePoseMethodAlignedCycle` 與 3.4 的 A2 字串，預期零命中；`public/` 中的 A2 字串仍只命中 temp-core。命中數與 3.4 Notes 對照。
5. **Playwright：載入**
   - `DOMContentLoaded` 時 `window.RFA.profiles` 已存在（`addInitScript` 監聽）；`Object.isFrozen(RFA.profiles.BUILTIN_PROFILES.hsu_pose_method.summary)`。
   - `RUNNER_PROFILES` 三個 key 都有 `cycleKeyframes`（101 幀）；`RUNNER_PROFILES.hsu_pose_method.summary !== RFA.profiles.BUILTIN_PROFILES.hsu_pose_method.summary`（是複本）。
   - 驗收第 5 點：與步驟 2 的基準逐點比較。
   - console 沒有 error（Tailwind CDN warning 允許），沒有 404。
6. **Playwright：互動與 B1–B6**（AGENTS 第 4 項）
   - 切換 Profile（hsu → night → custom 佔位 → 匯入的 `json_*`），播放／暫停、相位跳轉、ghost／trail 圖層。
   - **B2**：hsu 作用中時按「重設自動步幅」、改身高、改機位、手動步頻 120，前後 `evalCycle(0.3)` 相同；遙測與配速有變。
   - **B3**：無影片時按擷取 → 恰好一個 `POST /api/analyze`（body 有 `frames` 60 幀、無 `profileName`）→ 200 → 切到 `custom_captured`，有 101 幀關鍵幀，遙測步頻 166。用 `page.route` 模擬 429、500、逾時：alert 文案與影片擷取相同，按鈕復原。
   - **B4**：匯入一份 `pullPct: 40` 的測試 JSON（scratchpad 產生），播放 3 秒並切換 profile 來回，`summary.phaseTiming.pullPct` 維持 60，相位 HUD 顯示 60%。
   - **B5**：匯入 walk 樣本：遙測 103／361ms／96，畫布顯示缺關鍵幀提示，console 沒有 error；匯入壞的 `cycleKeyframes`：`console.warn`（新文案）與提示。
   - **B6**：無影片預覽（`startSimulatedVideoFeed`）在 hsu、night、custom 都顯示剪影；切到 walk 匯入檔時顯示提示與 `—`。
   - 影片回歸：拖入／選擇 `woman03 - Trim.mp4`，切到 `custom_captured` 佔位時有骨架（烘焙），擷取後恰好一個 POST，結果 193，101 幀；手動步幅 `1.1`／`abc`；匯出 JSON 含 `phaseTiming` 與 `cycleKeyframes`。
7. 文件核對（第 12 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 12. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/client-server-boundary.md` | 頂端狀態：`lib/profiles/` 已於 3.5 建立。第 4 章總表：`evaluateProfileAngles` 改為 `lib/player/keyframes.js:行號`（只看關鍵幀）；`evaluateProfileCycle` 註記「3.5 起 UI 不再呼叫，3.7 隨 temp-core 刪除」；`getActiveRunnerTiming` 註記「3.5 由 `public/js/state.js` 的唯讀 `getActiveProfileTiming` 取代」；`RUNNER_PROFILES` 改為 `lib/profiles/builtin.js`。第 5 章 D2、D3、D4、D9 的「影響」欄註記 3.5 已落實；D9 補上探針與 S1–S7 摘要。第 8 章補 3.5 一段。第 9 章前兩項標示「已於 3.5 修正」 |
| `docs/planning/epics-and-features.md` | 3.5 改為 `done`，寫一句結論並連到本規格；「待處理」第 85、86 行的 3.5 部分改為已落實 |
| `docs/analysis-json-contract.md` | `:29` 的 `phaseTiming` 來源改為 `profile.summary.phaseTiming`（唯讀）；`:85` 註解與 §2.5 第 4 點（`:175`）改為「缺少或不合法時不顯示骨架並提示；不合法時 `console.warn`，不 alert」（D2，決策文件第 6 章） |
| `docs/privacy.md` | 第 2 節：無影片的模擬擷取**改為呼叫 `/api/analyze`**，送出預先烘焙的合成 landmarks（非使用者資料）與當下的身高、機位，不送檔名。第 3 節上傳資料表補一列「模擬擷取」。過渡期段落加一句：3.5 起 `lib/profiles/`（內建 profile 靜態資料、烘焙關鍵幀、合成 landmarks）也以 `public/modules/` 公開，只有輸出、沒有公式 |
| `README.md` | 目前狀態：3.5 完成；新增 `npm run bake:profiles` 說明；仍不可部署 |
| `lib/config.js` | `:4–5` 檔頭註解改為「`RUNNER_PROFILES` 的靜態資料在 `lib/profiles/`（3.5）」 |
| `AGENTS.md` | 不改。若使用者同意，可在「專案技術範圍」補一句「改 `lib/profiles/builtin.js` 後執行 `npm run bake:profiles`」（第 15 節第 2 點） |

## 13. 風險與已知限制

- **合成資料只代表單一步態**：模擬擷取永遠回傳同一個結果（依身高與機位不同而略有差異）。它是功能展示，不是測試核心正確性的資料；P3 快照把它固定住，核心改變時快照會失敗，須重新烘焙並檢視。
- **核心改版連動**：日後若改 `generatePoseMethodAlignedCycle` 或擷取／分析公式，P1／P3 會失敗，須重新烘焙、更新快照，並檢查 S1–S7 是否仍成立。這是預期的把關，不是誤報。
- **舊格式匯入暫時沒有骨架**（B5）：3.5 至 3.7 期間的功能缺口。過渡期不部署，影響只在本地；3.7 由 derive 補齊（第 15 節第 1 點）。
- **模擬擷取依賴網路與限流**：離線或限流時會顯示錯誤，而舊版可以離線使用。限流是每 IP 30 次／60 秒，正常使用不易觸發。
- **初始化時機**：`RUNNER_PROFILES` 在 `DOMContentLoaded` 才填入。若將來有程式在 classic script 頂層讀取它，會拿到空物件。F 組測試只檢查初始化順序，無法限制所有呼叫時機，屬已知限制。`bridge.js` 載入失敗時沒有退回：`RFA` 不存在，`initRunnerProfiles` 會拋錯，Playwright 會直接看到（與 3.4 同一策略）。
- **烘焙用 resolve hook**：`scripts/server-only-hook.mjs` 依賴 Node 24 的 `module.registerHooks`。Node 主版本升級時須確認；`engines` 已鎖 `24.x`。
- **內插差異**（B1）：節點之間最大 1.14°（trunk），肉眼難以察覺；與 Server 產生的關鍵幀播放方式一致。
- **仍不可部署**：3.5 完成不代表可以進 4.1。

## 14. 待決定（start 時先採預設）

1. **產生檔格式**：`.js` 模組（**建議**，第 6.1 節）／`.json`＋import attributes（瀏覽器相容性風險）／`.json`＋`fetch` 載入（違反「`fetch` 只有一處」，而且多一次請求）。
2. **烘焙腳本如何處理 `server-only`**：`node --import scripts/server-only-hook.mjs`（**建議**）／以 Vitest 執行產生（例如 `BAKE=1 vitest run tests/bake.gen.js`，不需要 hook，但用測試框架寫檔較不直觀）／把 `server-only` 加為 devDependency（新增依賴，須同意）。
3. **計時函式命名**：新名稱 `getActiveProfileTiming`，放在 `state.js`（**建議**，第 6.7 節）／在 `analyzer.js` 同名覆寫 temp-core（依賴載入順序，不建議）／放到 `lib/player` 做成純函式 `readPhaseTiming(profile)`（目前只有 UI 使用，沒有必要）。
4. **`lib/core/keyframes.js`**：刪除（**建議**，比照 3.4 刪除 `landmark-extract.js`）／保留成只有轉匯出的空殼檔。
5. **合成資料參數**：60 幀／30 fps／髖部不動／`isManualDirection: true`（**建議**，第 7.2–7.3 節）。原型若需要調整，在 7.2 的參數範圍內自行決定並記錄。

## 15. 未決事項（不阻擋開工，需要使用者回答）

1. **舊格式匯入在 3.5–3.7 期間不顯示骨架（B5）是否可以接受？**
   - **建議預設：接受。** 照 D2 完整移除退回路徑，畫布顯示提示、遙測照常。過渡期不部署，3.7 用 derive 補關鍵幀後恢復。
   - 替代：3.5 對 `json_*` 保留暫時退回，呼叫 temp-core 全域的 `generatePoseMethodAlignedCycle`，3.7 刪除。體驗不中斷，但 3.5 的「移除退回路徑」只做一半，F 組測試也要開例外。
2. **是否在 `AGENTS.md` 加入「改 `lib/profiles/builtin.js` 後執行 `npm run bake:profiles`」的規則？** 建議預設：不改 AGENTS，只寫在 README 與測試失敗訊息。這與 3.4 未決事項第 2 點性質相同，可以一起回答。
3. **`package.json` 新增 npm script `bake:profiles`**（不是依賴）是否同意？建議預設：同意（3.4 的 `sync:legacy` 是同樣作法）。不同意時，改成在 README 記載完整的 `node --import …` 指令。
