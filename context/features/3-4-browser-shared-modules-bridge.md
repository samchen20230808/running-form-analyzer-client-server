# Feature 3.4 — 瀏覽器共用模組與橋接

## Status

`done`（第 13 節採建議預設；第 14 節未決事項待使用者回答）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

落實 [`docs/client-server-boundary.md`](../../docs/client-server-boundary.md) 的 **D1** 與 **D8**。把「必須在瀏覽器執行」的純函式從 server-only 的 `lib/core/` **搬到**兩個非 server-only 的單一來源模組：

- `lib/player/`：`solveKinematics`、`sampleCycleKeyframes`、`normalizeCycleKeyframes`、`CYCLE_KEYFRAME_NUMERIC_FIELDS`、`CYCLE_KEYFRAME_MIN_FRAMES`，以及 UI 輸入解析 `parseManualStrideValue`（決策文件第 4 章「瀏覽器模組（UI 輸入解析）」）。
- `lib/landmarks/`：`extractAnglesFromLandmarks`、`evaluateCaptureFrame`。

`lib/core/` 改為從這兩個模組 import 或轉匯出，Server 與瀏覽器執行的是**同一份程式**。另外定案 public 頁面的**橋接機制**（3.2 未決事項 1、3.3 第 4.3 節、3.3 未決事項 2）：把模組同步複製到 `public/legacy/modules/`，以測試把關與 `lib/` 內容相同，再由一支 module script 掛到 `window.RFA`。舊 UI 在第 2 節列出的呼叫點同行改用 `RFA.*`。

**行為不變**：函式本體逐字照搬，不改任何數值。`npm test` 基準照舊：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150。temp-core 保留、不修改，部署防線不動，**仍不可部署**。

## 1. 目標與非目標

### 目標

1. 建立 `lib/player/`、`lib/landmarks/`，非 server-only。函式本體與 `lib/core/` 現版（等同 temp-core）逐字相同。
2. 從 `lib/core/` 移除上述定義，改由新模組提供。`lib/core/index.js` 的 9 個對外名稱與型別不變（`tests/core-modules.test.js:21–35`）。
3. 橋接：`scripts/sync-legacy-modules.mjs` 把模組複製到 `public/legacy/modules/`，`public/legacy/modules/bridge.js` 掛上 `window.RFA = { player, landmarks }`，`index.html` 以同行附加的方式載入。
4. 舊 UI 的 D1／D8 呼叫點（第 2 節「3.4 切換」各列）改用 `RFA.player.*`／`RFA.landmarks.*`。
5. 測試把關三種分岔：`lib/` 與 `public/legacy/modules/` 內容相同；新模組與 temp-core 的函式本體相同（3.7 前）；新模組不 import `lib/core`／`lib/server`、不含 server-only 核心字串。
6. 文件如實更新：決策文件、路線圖、`docs/privacy.md`、README。

### 非目標

- `evaluateProfileAngles` 的拆分、「只看關鍵幀的取樣入口」、移除退回路徑（D2），以及 `evaluateProfileCycle`、`getActiveRunnerTiming`、`renderSimVideo` 的 `evaluateProfileCycle`（`index.html:2063`）、內建 profile 烘焙（D3、D4、D9）：都在 **3.5**。理由見第 6.4 節。
- 契約 1.1.0、`POST /api/derive`、遙測／GCT／總分／步幅改讀 Server（3.6、3.7）。
- 移除 temp-core、移除部署防線、`.next/static/` 與 `public/` 的完整移除驗收（3.7，3.3 規格第 4.4 節）。
- `lib/contract/`、`lib/config.js`、`lib/profiles/` 進橋接（3.5／3.7 視需要加入同步清單，第 6.2 節已預留）。
- React 化、頁面 CSP、`fix-walking-hud-foot-label`、門檻重複（D10）、部署與 push。

## 2. 現況盤點

基準：本專案 `master` `4febc9f`，工作區乾淨，以 Grep 與一次性腳本取得（腳本放 scratchpad，不提交）。

### 2.1 函式位置與 temp-core 對照

用腳本擷取函式文字並把 CRLF 正規化（`git config core.autocrlf` 為 `true`，沒有 `.gitattributes`，工作區是 CRLF），比對結果全部**逐字相同**：

| 名稱 | `lib/core/` 現位置 | temp-core 位置 | 比對 | `lib/` 內的使用者 |
| ---- | ------------------ | -------------- | ---- | ----------------- |
| `CYCLE_KEYFRAME_NUMERIC_FIELDS` | `keyframes.js:10–23` | `temp-core/keyframes.js:10–23` | 相同 | `keyframes.js:53`、`:91`；`keyframes-builder.js:3`、`:13`；`index.js:10` |
| `CYCLE_KEYFRAME_MIN_FRAMES` | `keyframes.js:24` | `temp-core/keyframes.js:24` | 相同 | `keyframes.js:38–39` |
| `normalizeCycleKeyframes` | `keyframes.js:27–72` | `temp-core/keyframes.js:27–72` | 相同 | 無（Server 不使用） |
| `sampleCycleKeyframes` | `keyframes.js:75–97` | `temp-core/keyframes.js:75–97` | 相同 | `keyframes.js:102`（`evaluateProfileAngles`） |
| `evaluateProfileAngles` | `keyframes.js:100–105` | `temp-core/keyframes.js:100–105` | 相同 | 無（依賴 `generatePoseMethodAlignedCycle`，`keyframes.js:2`、`:104`） |
| `extractAnglesFromLandmarks` | `landmark-extract.js:16–196` | `temp-core/landmark-extract.js:17–197` | 相同 | `index.js:12` → `lib/server/analyze.js:39` |
| `evaluateCaptureFrame` | `landmark-extract.js:207–245` | `temp-core/landmark-extract.js:208–246` | 相同 | `index.js:13` → `lib/server/analyze.js:47` |
| `parseManualStrideValue` | `biomechanics.js:475–479` | `temp-core/biomechanics.js:500–504` | 相同 | 無 |
| `solveKinematics` | `biomechanics.js:481–596`（檔尾） | `temp-core/biomechanics.js:506–621` | 相同 | 無（Server 不使用，D1） |

- 這 9 個名稱都沒有外部 import。`lib/core/landmark-extract.js` 的兩個函式與 `solveKinematics`、`parseManualStrideValue` 只用 `Math` 與參數；`normalizeCycleKeyframes`、`sampleCycleKeyframes` 只依賴同檔常數。因此可以原樣搬出，不需要改寫。
- `tests/` 沒有直接 import 這些函式或 `lib/core/keyframes.js`／`landmark-extract.js`，只經由 `lib/core/index.js`（`tests/baseline.test.js:7–14`、`tests/core-modules.test.js:4`）。
- `docs/analysis-json-contract.md:130`、`:157` 以名稱引用 `normalizeCycleKeyframes`、`solveKinematics`，沒有寫路徑，不需修改。

### 2.2 舊 UI 呼叫點（`public/legacy/`，不含 temp-core）

| # | 位置 | 名稱 | 3.4 |
| - | ---- | ---- | --- |
| 1 | `js/analyzer.js:2` | `extractAnglesFromLandmarks` | **切換** → `RFA.landmarks.` |
| 2 | `js/analyzer.js:61` | `evaluateCaptureFrame` | **切換** → `RFA.landmarks.` |
| 3 | `js/analyzer.js:221`（`applyCapturedResult`）、`:478`（`importAnalysisJSON`） | `normalizeCycleKeyframes` | **切換** → `RFA.player.` |
| 4 | `js/renderer.js:55`、`56`、`65`、`84`、`142` | `solveKinematics` | **切換** → `RFA.player.` |
| 5 | `index.html:2064`（`renderSimVideo`） | `solveKinematics` | **切換**（上一行 `:2063` 的 `evaluateProfileCycle` 不動，3.5） |
| 6 | `index.html:1386`（`onManualStrideInput`） | `parseManualStrideValue` | **切換** → `RFA.player.` |
| 7 | `js/analyzer.js:472`；`js/config.js:67`、`93`、`119` | `evaluateProfileAngles`（`evalCycle`） | 不動：退回分支需要 `generatePoseMethodAlignedCycle`（server-only）→ 3.5 |
| 8 | `temp-core/keyframes.js:102` | `sampleCycleKeyframes`（temp-core 內部） | 不動（temp-core 不得修改） |

- 上述呼叫都在函式內部。最早的觸發點是 `DOMContentLoaded` 之後的 `animateLoop`（`index.html:2084–2091`、`js/renderer.js:709`）、MediaPipe 回呼與使用者輸入。classic script 頂層沒有直接呼叫，因此 deferred 的 module script 來得及在任何呼叫前掛好 `RFA`（第 6.3 節、Verification 第 5 步實測）。
- `public/legacy/` 目前沒有 `type="module"`、`RFA`、`modules/` 字樣（Grep 確認），不會衝突。

### 2.3 既有測試對本 Feature 的約束

- `tests/core-modules.test.js:68–71`：`lib/core/*.js` 第一行必須是 `import "server-only";`。新模組不在 `lib/core/`，不受影響；`lib/core/` 留下的檔案照舊要符合。
- `tests/core-modules.test.js:90–98`：`lib/server` 只能經由 `../core/index.js` 使用核心。本 Feature 維持這個規則：`lib/server/analyze.js` 不改，仍用 `core.extractAnglesFromLandmarks`。
- `tests/legacy-client.test.js:36–42`：`app/`、`lib/` 的 `.js` **不得包含字串 `public/legacy`、`temp-core`**。因此新模組的註解不能寫出這兩個字串，橋接說明要寫在 `scripts/` 與 `public/legacy/modules/bridge.js`。
- `tests/legacy-client.test.js:66–97`：`public/legacy/**` 禁用儲存與外送通道，`fetch(` 只能有一處。新的 `modules/**` 自動納入掃描，不得違反。
- `tests/legacy-client.test.js:124–131`：`public/**/*.js` 中的核心特有字串只能出現在 temp-core。`modules/` 自動納入，第 8 節加強這條。
- `tests/privacy-docs.test.js:28–54`：`lib/**` 不得有 `console.`（只允許 http-handler 一處）、`process.env`、`fetch(` 等。新模組不需要這些。

## 3. Next.js 16.4.6 查證

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`：`public/` 檔案從根路徑原樣提供，**不經 bundler**，預設 `Cache-Control: public, max-age=0`。`public/legacy/modules/**` 會以 `/legacy/modules/**` 提供；改檔後瀏覽器會重新驗證，不會讀到舊快取。
- module script 能否執行取決於回應的 `Content-Type` 是否為 JavaScript MIME。Next 對 `.js` 的實際標頭以 Verification 第 3 步的 `curl -I` 為準。
- `next.config.mjs` 的 `headers()` 只套用 `/api/:path*`，不影響 `/legacy/modules/*`（3.2 規格已查證）。
- 本 Feature 不新增路由、不改 `next.config.mjs`、不用新的 Next API。start 時仍須依 AGENTS 重讀上述頁面，確認沒有新的 deprecation。

## 4. 搬還是複製：**搬**（`lib/` 內只有一份）

| 選項 | 作法 | 結論 |
| ---- | ---- | ---- |
| **A. 搬（建議，D1／D8 原文）** | 定義移到 `lib/player/`、`lib/landmarks/`；`lib/core/` 從那裡 import 或轉匯出 | `lib/` 內沒有第二份，不可能分岔。`lib/core` → `lib/player`／`lib/landmarks` 是 server-only 模組 import 一般模組，方向允許；反向禁止（測試把關） |
| B. 複製 | `lib/core/` 保留原定義，另建瀏覽器版 | 兩份會漂移，需要額外的逐字測試，違反 D1「單一來源」。不採用 |

採 A 之後，全專案的副本與把關方式：

| 副本 | 性質 | 把關 | 存續 |
| ---- | ---- | ---- | ---- |
| `lib/player/`、`lib/landmarks/` | **正本** | baseline 逐值、`core-modules` 同一性斷言 | 永久 |
| `public/legacy/modules/{player,landmarks}/` | 同步產物（提交進 git） | 與正本內容相同（第 8 節 B1） | 到 React 化改由 bundler 打包為止 |
| `public/legacy/temp-core/` | 凍結的舊副本 | 函式本體與正本相同（第 8 節 C1） | 3.7 刪除 |

## 5. 範圍

```
lib/
  player/
    keyframes.js        # 新增：CYCLE_KEYFRAME_*、normalizeCycleKeyframes、sampleCycleKeyframes（照搬 lib/core/keyframes.js:10–97）
    kinematics.js       # 新增：solveKinematics（照搬 lib/core/biomechanics.js:481–596）
    stride-input.js     # 新增：parseManualStrideValue（照搬 lib/core/biomechanics.js:475–479）
    index.js            # 新增：轉匯出上面三支
  landmarks/
    landmark-extract.js # 新增：extractAnglesFromLandmarks、evaluateCaptureFrame（照搬 lib/core/landmark-extract.js:9–245，含 JSDoc）
    index.js            # 新增：轉匯出
  core/
    keyframes.js        # 修改：刪除 :10–97 的定義；從 ../player/keyframes.js import sampleCycleKeyframes、轉匯出兩個常數；保留 evaluateProfileAngles（3.5 處理）；更新檔頭註解
    biomechanics.js     # 修改：刪除 :475–596（parseManualStrideValue、solveKinematics，皆在檔尾）
    landmark-extract.js # 刪除
    index.js            # 修改：:11–14 改為 from "../landmarks/index.js"
scripts/
  sync-legacy-modules.mjs   # 新增：同步複製（含自我檢查，第 6.2 節）
public/legacy/
  modules/
    bridge.js           # 新增（手寫）：import 兩個 index.js，掛 window.RFA
    player/、landmarks/ # 新增（同步產物）：與 lib/ 同名同結構
  index.html            # 修改：:1333 同行附加 <script type="module" src="modules/bridge.js"></script>（行數不變）
  js/analyzer.js        # 修改：:2、:61、:221、:478 同行替換
  js/renderer.js        # 修改：:55、56、65、84、142 同行替換
package.json            # 修改：scripts 加 "sync:legacy": "node scripts/sync-legacy-modules.mjs"（不新增依賴）
tests/
  browser-modules.test.js   # 新增：第 8 節 A、B
  core-modules.test.js      # 修改：只新增斷言（同一性、landmark-extract.js 已移除後的檔案清單）
  legacy-client.test.js     # 修改：第 8 節 C
docs/client-server-boundary.md、docs/planning/epics-and-features.md、docs/privacy.md、README.md
context/current-feature.md  # Notes
```

- **不修改**：`lib/server/`、`lib/contract/`、`lib/config.js`、`lib/core/cycle-analysis.js`、`lib/core/keyframes-builder.js`（仍從 `./keyframes.js` 取常數，經轉匯出拿到同一個陣列）、`app/`、`public/legacy/temp-core/`、`next.config.mjs`、`eslint.config.mjs`、`vitest.config.mjs`、`js/config.js`、`js/state.js`、`js/ui.js`、`js/pose.js`。
- **不新增依賴**。`package.json` 只加一個 npm script，start 時向使用者說明。
- **行號**：`js/renderer.js` 目前仍與 `e29766d` 相同，本 Feature 只做同行替換，維持不變。`index.html` 也只做同行附加，行數不變。`lib/core/biomechanics.js` 只刪檔尾，其他函式行號不變。`lib/core/keyframes.js` 行號會改變，決策文件第 4 章同步更新。

## 6. 設計決策

### 6.1 模組形狀

- **函式本體逐字照搬**，只把 `function` 前的修飾改成 `export`（與 `lib/core/` 現行寫法相同）。檔頭註解重寫，說明「非 server-only；瀏覽器與 Server 共用的單一來源；不得 import `lib/core`／`lib/server`」。註解不得出現 `public/legacy`、`temp-core`（第 2.3 節）；`server-only` 字樣只能出現在「不得 import」的說明裡，測試以去除註解後的程式碼檢查。
- `lib/player/` 內部只用相對 import（`./keyframes.js`），`lib/landmarks/` 無 import。所有 import 路徑都帶 `.js` 副檔名，因為瀏覽器直接載入，沒有 resolver。
- `parseManualStrideValue` 放在 `lib/player/stride-input.js`。它是 UI 輸入解析，不屬於繪圖，但為了避免多一個命名空間與同步目錄，歸在 `player`（「瀏覽器端播放與輸入用的純函式」）。替代方案見第 13 節第 3 點。
- `lib/core/keyframes.js` 改為：

  ```js
  import "server-only";
  import { generatePoseMethodAlignedCycle } from "./biomechanics.js";
  import { sampleCycleKeyframes } from "../player/keyframes.js";
  export { CYCLE_KEYFRAME_NUMERIC_FIELDS, CYCLE_KEYFRAME_MIN_FRAMES } from "../player/keyframes.js";
  // evaluateProfileAngles 本體不變（3.5 拆分並刪除退回分支）
  ```

  `normalizeCycleKeyframes` 不從 `lib/core` 轉匯出，依 D1 移除，Server 不使用。
- `lib/core/landmark-extract.js` 刪除，`lib/core/index.js:11–14` 改為 `export { extractAnglesFromLandmarks, evaluateCaptureFrame } from "../landmarks/index.js";`。留一支只有轉匯出的空殼檔沒有價值，而且會讓決策文件的位置引用變得模糊。

### 6.2 同步腳本 `scripts/sync-legacy-modules.mjs`

- 來源清單寫死在腳本頂端：`["player/", "landmarks/"]`（相對於 `lib/`）。目的地是 `public/legacy/modules/` 下的**相同相對路徑**。保留 `lib/` 的目錄結構，日後加入 `lib/config.js`、`lib/contract/`（它們 import `../config.js`）時，相對 import 不用改寫。
- 行為：先清空目的地中受管理的子目錄，再逐檔複製位元組。`bridge.js` 不在受管理範圍。
- 自我檢查（任一不符就 `process.exit(1)`，不寫任何檔案）：來源檔不得 import `server-only`、`../core/`、`../server/`、`node:`；只允許相對路徑 import，而且解析後仍在來源清單內。
- 不掛在 `prebuild`／`predev`。build 時改寫被追蹤的檔案會掩蓋「忘了同步」，因此一律手動執行 `npm run sync:legacy`，由 Vitest 偵測漂移，失敗訊息提示指令。
- 副本**提交進 git**：public 頁面不經 build，副本必須存在於 repo 中才能部署。

### 6.3 橋接 `public/legacy/modules/bridge.js`

```js
// 3.4 橋接：把 lib/ 的瀏覽器共用模組（同步副本，見 scripts/sync-legacy-modules.mjs）掛到 window.RFA 供舊全域 script 使用。
// 手寫，不由同步腳本產生。React 化後刪除。
import * as player from "./player/index.js";
import * as landmarks from "./landmarks/index.js";
window.RFA = Object.freeze({ player, landmarks });
```

- `index.html:1333` 改為 `<script src="js/analyzer.js"></script><script type="module" src="modules/bridge.js"></script>`，同一行，行數不變。module script 一律延後執行（DOM 解析完、`DOMContentLoaded` 之前），所以放在哪裡都一樣，放在 analyzer 後面只是為了好讀。
- 使用命名空間 `RFA`：temp-core 以全域 `function` 宣告了同名函式（`solveKinematics` 等），不能直接覆蓋全域名稱。
- 不提供退回：若 `bridge.js` 載入失敗，`RFA` 不存在，切換後的呼叫點會拋錯。這是刻意的，讓錯誤在 Playwright 中直接顯現，而不是悄悄改用 temp-core。
- 替代方案（不採用）：Client Component 頁面（3.2 方案 B，改動大，與「行為不變」衝突）；esbuild 等打包器（新增依賴，而且模組只有數百行，不需要打包）；import maps（仍要複製檔案，沒有額外好處）。

### 6.4 Client 切換範圍：**切換第 2.2 節第 1–6 列**，其餘不動

| 選項 | 內容 | 評估 |
| ---- | ---- | ---- |
| **A. 切換（建議）** | 第 1–6 列同行改成 `RFA.*`；temp-core 照舊載入，供 `evaluateProfileAngles`、遙測等使用 | 橋接在真實路徑（擷取、骨架、匯入、手動步幅）上被 Playwright 驗證；3.7 移除 temp-core 時只剩 3.5–3.7 本來就要處理的呼叫。函式本體由測試 C1 保證與 temp-core 相同，所以行為不變 |
| B. 只建立不切換 | UI 不改，`RFA` 只供 Playwright 比對 | 風險最低，但橋接只是空接；module 載入時機與 MIME 問題要到 3.5／3.7 才會在真實路徑出現，與其他變更混在一起時不好定位 |

**`evaluateProfileAngles` 不在 3.4 切換**：它有退回分支，必須呼叫 `generatePoseMethodAlignedCycle`（server-only）。「只看關鍵幀的取樣入口」在缺關鍵幀時該回傳什麼，取決於 D2 的 UX（不顯示骨架並提示），而內建 profile 要等 D3 烘焙後才有關鍵幀。所以這個入口與拆分一起放在 3.5，3.4 不先寫沒人呼叫的程式。3.4 期間，renderer 的關鍵幀取樣仍經由 temp-core 的 `evaluateProfileAngles` → `sampleCycleKeyframes`，本體與 `lib/player` 相同。

### 6.5 本 Feature 對 D0–D11 的處理

| 決策 | 3.4 |
| ---- | --- |
| D0 | 延續：temp-core、部署防線不動 |
| D1 | **落實**，只差 `evaluateProfileAngles` 拆分（3.5，D2 相依） |
| D8 | **落實**：`lib/landmarks/` 為單一來源，Client 即時 HUD、同步骨架、閘門改用它，Server 經 `lib/core/index.js` 用同一份 |
| D2–D7、D9、D10 | 不做 |
| D11 | 隱私見第 11 節：沒有新的資料流，只改變「哪些程式公開在瀏覽器」的正式範圍 |

## 7. 實作步驟

1. start 前先擷取一次值：用 `lib/core` 現版計算第 8 節 A4 的冒煙值（`solveKinematics`、`sampleCycleKeyframes` 等），把數值寫進測試，作為搬遷前的基準。
2. 新增 `lib/player/`、`lib/landmarks/`（照搬），修改 `lib/core/{keyframes,biomechanics,index}.js`，刪除 `lib/core/landmark-extract.js`。
3. `REQUIRE_BASELINE=1 npm test`：先不加新測試，確認既有基準全過（純 refactor 檢查點）。
4. 新增 `scripts/sync-legacy-modules.mjs`、npm script，執行同步；新增 `public/legacy/modules/bridge.js`。
5. `index.html:1333` 同行附加；`analyzer.js`、`renderer.js`、`index.html:1386`／`:2064` 同行替換。
6. 新增或修改測試（第 8 節），跑 `npm test`、build、lint。
7. 依 Verification 執行 HTTP 與 Playwright 檢查；更新文件（第 11 節）；把 Notes 寫入 `context/current-feature.md`。

## 8. 測試計畫

**既有測試**：全部照舊通過，基準不變：`REQUIRE_BASELINE=1 npm test` → walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、landmarks 193／176／150。`baseline.test.js` 經 `lib/core/index.js` 取得的 `CYCLE_KEYFRAME_NUMERIC_FIELDS`、`extractAnglesFromLandmarks`（`analyzeRequest` 內部）現在來自新模組，因此 baseline 通過就證明了 Server 路徑零行為變更。

**A. `tests/browser-modules.test.js`（新增，永久）**

1. 結構：`lib/player/**`、`lib/landmarks/**` 去除註解後不含 `server-only`、`\b(document|window)\b`；import 只允許 `./` 開頭，而且解析後仍在同一目錄樹內（不得出現 `../core`、`../server`、`node:`）。
2. 不含 server-only 核心的識別字與字串（掃描完整原始檔）：`generatePoseMethodAlignedCycle`、`computeGctMetrics`、`computePersonalizedPhaseTiming`、`calculateOverallRunningScore`、`analyzeCapturedFrames`、`detectCadenceFromFrames`、`computeStrideForCameraMode`、`computeAutoStrideMeters`、`buildCycleKeyframesFromSummary`、`嚴重跨步煞車或身後推蹬`（`lib/core/biomechanics.js:142`）、`🚶 行走步態 (雙腳交替支撐 • 零騰空)`（`:83`）、`📷 手動鎖定靜態機位`（`:459`）。
3. 同一性：`core.CYCLE_KEYFRAME_NUMERIC_FIELDS === player.CYCLE_KEYFRAME_NUMERIC_FIELDS`、`core.extractAnglesFromLandmarks === landmarks.extractAnglesFromLandmarks`、`core.evaluateCaptureFrame === landmarks.evaluateCaptureFrame`。
4. 冒煙值（步驟 1 擷取的值，逐值 `toBe`）：
   - 對 `kf-walk-101` 的 `cycleKeyframes`：`normalizeCycleKeyframes(...).ok === true`；壞資料（少於 21 幀、`p` 非遞增、缺欄位、`model` 錯誤）各回傳對應錯誤字串。
   - `sampleCycleKeyframes` 在 p = 0、0.37、1、1.25 的輸出。
   - `solveKinematics(sample(p), 300, 360, 1.0)` 的 `hip`、`head`、`rightLeg.toe` 座標。
   - `parseManualStrideValue`：`"1.234"` → 1.23、`"0.04"` → null、`"abc"` → null、`"2.5"` → 2.5。
   - 需要樣本的部分沿用 `baseline.test.js` 的 `REQUIRE_BASELINE`／`skipIf` 規則；不依賴樣本的壞資料案例永遠執行。
5. **B1 同步一致**：`public/legacy/modules/` 下受管理子目錄的檔案清單與 `lib/player/`、`lib/landmarks/` **完全相同**，內容在 `\r\n` → `\n` 正規化後**逐位元組相同**。正規化的理由：`core.autocrlf=true`、沒有 `.gitattributes`，工作區的換行由 git 決定，不屬於內容。失敗訊息提示「執行 `npm run sync:legacy`」。
6. `public/legacy/modules/` 只有受管理子目錄和 `bridge.js`；`bridge.js` 只 import `./player/index.js`、`./landmarks/index.js`。

**C. `tests/legacy-client.test.js`（修改，3.7 時隨 temp-core 一併改寫）**

1. **C1 與 temp-core 本體相同**：對第 2.1 節的 9 個名稱，從 `function 名稱(`（或 `const 名稱 =`）擷取到下一個位於第 0 欄的 `}`／`];`，正規化 CRLF 並去掉 `export ` 後，新模組與 `public/legacy/temp-core/` 的文字相同。`evaluateProfileAngles` 改比 `lib/core/keyframes.js` 與 temp-core。這一條保證第 6.4 節的切換不改變行為。
2. `index.html` 恰好含一次 `<script type="module" src="modules/bridge.js"></script>`，而且與 `src="js/analyzer.js"` 在同一行（行數不變）。
3. `public/legacy/js/*.js` 與 `index.html` 中，`solveKinematics`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame`、`normalizeCycleKeyframes`、`parseManualStrideValue` 只能以 `RFA.player.`／`RFA.landmarks.` 前綴呼叫（正則 `(?<![.\w])名稱\s*\(` 零命中）。`evaluateProfileAngles`、`evaluateProfileCycle` 不檢查（3.5）。
4. 「核心特有字串只出現在 temp-core」（現 `:124–131`）：marker 改用 A2 的字串清單，並明確斷言 `public/legacy/modules/**` 零命中。
5. 其餘既有斷言（temp-core 隔離、`TEMP-CORE` 檔頭、版本同步、儲存與 `fetch` 限制、上傳上限、部署防線）不變。

**D. `tests/core-modules.test.js`（只新增）**：`lib/core/` 不再定義 `solveKinematics`、`parseManualStrideValue`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、`extractAnglesFromLandmarks`、`evaluateCaptureFrame`（以 `function 名稱` 字串檢查）。既有的「9 個名稱」「第一行 server-only」不改。

## 9. 驗收標準

1. 第 2.1 節的 8 個瀏覽器名稱只在 `lib/player/`、`lib/landmarks/` 各定義一次；`lib/core/` 不再定義它們，`lib/core/index.js` 的 9 個名稱不變。
2. `REQUIRE_BASELINE=1 npm test` 全過，基準數值不變；新增測試 A–D 全過。
3. `npm run sync:legacy` 執行後 `git status` 沒有差異（副本已是最新）；故意改動 `lib/player` 一個字元時，B1 會失敗（驗證後還原）。
4. 頁面載入後 `window.RFA.player`、`window.RFA.landmarks` 存在且已凍結，在 `DOMContentLoaded` 觸發時就已存在；`/legacy/modules/**` 的請求都是 200，`Content-Type` 為 JavaScript MIME。
5. 在頁面中，`RFA.*` 與 temp-core 全域函式對相同輸入的輸出深度相等（Verification 第 5 步）。
6. 影片擷取、切換 Profile、播放骨架、匯入 walk JSON（103／361ms／96）、手動步幅、無影片預覽都與 3.3 相同，console 沒有 error，沒有 404。
7. `git diff --stat -- lib/server lib/contract lib/config.js app public/legacy/temp-core next.config.mjs` 為空；`VERCEL=1` 仍會讓 build 失敗。
8. 文件依第 11 節更新，不宣稱尚未成立的保護。

## 10. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`、`npm run lint`（lint 會掃到 `lib/player`、`lib/landmarks`、`scripts/`，`public/legacy/**` 照舊忽略）。
2. `REQUIRE_BASELINE=1 npm test`，記錄基準數值；另跑一次不帶變數的 `npm test`。執行驗收第 3 點的「故意改一個字元」檢查，記錄失敗訊息後還原。
3. HTTP（`npm run dev`，用 `curl -i`）：`GET /` → 307；`/legacy/modules/bridge.js`、`/legacy/modules/player/index.js`、`/legacy/modules/landmarks/landmark-extract.js` → 200，記錄 `Content-Type`；同源樣本 `POST /api/analyze` → 200，5 個安全標頭不變。
4. **bundle 檢查**（一次性腳本，放 scratchpad）：`npm run build` 後在 `.next/static/` 搜尋 A2 的字串，以及 `solveKinematics`、`extractAnglesFromLandmarks`，預期全部零命中（`app/` 沒有 import 這些模組）。在 `public/` 搜尋 A2 的字串，預期只命中 temp-core。命中數寫入 Notes，供 3.7 對照。
5. **Playwright：載入與橋接**
   - 用 `page.addInitScript` 註冊 `DOMContentLoaded` 監聽，記錄當下 `!!window.RFA`，預期為 `true`。
   - `Object.isFrozen(window.RFA)`；`Object.keys(RFA.player).sort()` 等於 `["CYCLE_KEYFRAME_MIN_FRAMES","CYCLE_KEYFRAME_NUMERIC_FIELDS","normalizeCycleKeyframes","parseManualStrideValue","sampleCycleKeyframes","solveKinematics"]`；`RFA.landmarks` 為兩個函式。
   - **等價比對**（temp-core 仍在頁面上）：對三個內建 profile 與匯入的 `kf-walk-101`，在 101 個 p 值上比較 `RFA.player.solveKinematics(evalCycle(p), 300, 360, 1)` 與全域 `solveKinematics(...)`；比較 `RFA.player.sampleCycleKeyframes` 與全域版本；比較 `normalizeCycleKeyframes` 對合法與壞資料的結果；比較 `parseManualStrideValue` 對一組輸入的結果。把 `landmarks-woman03.json` 的 frames 傳入 `page.evaluate`，逐幀比較兩邊的 `extractAnglesFromLandmarks` 與 `evaluateCaptureFrame` 序列。全部深度相等。
   - console 沒有 error（Tailwind CDN warning 允許），沒有 404。
6. **Playwright：互動回歸**（AGENTS 第 4 項）：用 `woman03 - Trim.mp4` 擷取，即時 HUD 與同步骨架有更新，恰好一個 `POST /api/analyze` → 200，`custom_captured` 有 101 幀關鍵幀；切換 Profile（`hsu_pose_method` → `night_track_runner` → `custom_captured` → 匯入的 `json_*`）；播放／暫停骨架、相位跳轉、圖層切換（ghost、trail）；拖入影片（`#videoDropZone` drop）；匯入 walk JSON 顯示 103／361ms／96；匯入壞的 `cycleKeyframes` 時出現 `console.warn` 並退回；手動輸入步幅 `1.1` 後配速更新，輸入 `abc` 被忽略；無影片時的模擬擷取與徐國峰預覽。
7. 文件核對（第 11 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `docs/client-server-boundary.md` | 第 4 章總表：`solveKinematics`、`parseManualStrideValue`、`normalizeCycleKeyframes`、`sampleCycleKeyframes`、常數的「位置」改成 `lib/player/*`；`extractAnglesFromLandmarks`、`evaluateCaptureFrame` 改成 `lib/landmarks/landmark-extract.js:行號`；`evaluateProfileAngles` 改成新的 `lib/core/keyframes.js` 行號。第 5 章 D1、D8 的「影響」欄註記「3.4 已落實（`evaluateProfileAngles` 拆分於 3.5）」。第 8 章：3.4 標示完成，記錄橋接機制。第 2 章：`js/analyzer.js`、`js/renderer.js` 與 `index.html` 只做同行替換 |
| `docs/planning/epics-and-features.md` | 3.4 改為 `done`，說明改成一句結論並連到本規格；「待處理」中 `lib/player/` 那一條改為「3.4 已落實；`evaluateProfileAngles` 拆分於 3.5」 |
| `docs/privacy.md` | 第 2 節過渡期：補一句「3.4 起，`lib/player/`、`lib/landmarks/`（角度擷取、擷取閘門、關鍵幀取樣、正向運動學、步幅輸入解析）以 `public/legacy/modules/` 的同步副本在瀏覽器執行，這是 D1／D8 的永久範圍，不是過渡期」。沒有新的資料流，第 3 節不變；第 11 節加上 `browser-modules.test.js` 的檢查描述 |
| `README.md` | 目前狀態：3.4 完成；共用模組經 `public/legacy/modules/` 橋接；仍不可部署 |
| `AGENTS.md` | 不改（過渡期敘述仍正確）。若使用者同意，可在「專案技術範圍」補一句「`lib/player`、`lib/landmarks` 修改後執行 `npm run sync:legacy`」（第 14 節第 2 點） |

## 12. 風險與已知限制

- **忘記同步**：改了 `lib/player` 卻沒執行同步，`npm test` 會失敗（B1）。但如果只跑 `npm run dev`，頁面會用舊副本，開發時可能誤判。緩解方式是失敗訊息與 AGENTS 提示；不做 build 時自動同步（第 6.2 節）。
- **換行**：B1 以正規化後的內容比較；如果有人用 LF 與 CRLF 混雜的編輯器存檔，git 提交時仍會正規化，不影響部署內容。日後若加入 `.gitattributes` 統一 `eol=lf`，可改成嚴格比對位元組，但不在本 Feature 範圍。
- **module script 時機**：依 HTML 規範，deferred module script 在 `DOMContentLoaded` 前執行。本 Feature 以 Verification 第 5 步實測。如果將來有程式在 classic script 頂層呼叫 `RFA.*`，會拋 `ReferenceError`；測試 C3 只能限制呼叫寫法，無法限制呼叫時機，屬已知限制。
- **雙份全域並存**：3.4–3.7 期間，頁面同時有 temp-core 的全域函式與 `RFA.*`。C3 防止 UI 退回呼叫全域版本；temp-core 內部仍呼叫自己的版本（第 2.2 節第 8 列），由 C1 保證兩者相同。
- **公開範圍正式化**：`lib/landmarks` 的角度公式與門檻、`lib/player` 的正向運動學，從此在部署後的 `public/` 中公開。這是 D8（使用者決定）與 D1 的既定代價，不是新的取捨，但文件要寫清楚它是永久範圍。
- **lint 覆蓋不對稱**：正本 `lib/player` 受 ESLint 檢查，`public/legacy/modules/` 副本被忽略。內容相同，因此沒有實際影響。
- **仍不可部署**：3.4 完成不代表可以進 4.1。

## 13. 待決定（start 時先採預設）

1. **Client 切換範圍**：切換第 2.2 節第 1–6 列（**建議**，第 6.4 節 A）／只建立橋接、不切換（B）。
2. **橋接機制**：同步複製到 `public/legacy/modules/`、提交進 git，加上內容一致測試與 `bridge.js` 掛 `window.RFA`（**建議**，第 6.3 節）／Client Component 頁面／新增打包依賴（須同意）。
3. **`parseManualStrideValue` 的位置**：`lib/player/stride-input.js`（**建議**）／獨立的 `lib/input/`（多一個命名空間與同步目錄）／在 UI 內重寫（`index.html` 內就地實作，不進 `lib/`；決策文件第 4 章允許）。
4. **`lib/core/landmark-extract.js`**：刪除，由 `index.js` 直接轉匯出（**建議**）／保留成只有轉匯出的空殼檔。

## 14. 未決事項（不阻擋開工，需要使用者回答）

1. `package.json` 新增 npm script `sync:legacy`（不是依賴，只是指令別名），是否同意？不同意時改成在 AGENTS 記載 `node scripts/sync-legacy-modules.mjs`。
2. 是否在 `AGENTS.md`「專案技術範圍」加入「修改 `lib/player`、`lib/landmarks` 後須執行同步」的規則？加了可以減少第 12 節第 1 條的風險，但會改動協作規則檔，因此須經使用者同意。
