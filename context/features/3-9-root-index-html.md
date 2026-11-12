# Feature 3.9 — 頁面改為根路徑 `/index.html`

## Status

`planned`（第 13 節採建議預設；第 14 節未決事項待使用者回答）

## Epic

Epic 3 — Client 改為呼叫 Server

## Objective

使用者要求：`npm run dev` 後直接以 `http://localhost:3000/index.html` 開啟頁面。現在頁面位於 `/legacy/index.html`，`/` 以 307 導向該處（`next.config.mjs:13–15`）。

**決定**：把舊 Client 的頁面、UI script、樣式與橋接模組從 `public/legacy/` **搬到 `public/` 根目錄**（`git mv`，內容不變）；**暫時核心 `public/legacy/temp-core/` 留在原處**，`index.html` 只把 4 個 temp-core `src` 改成 `legacy/temp-core/…`（同行替換，行數不變）。`/` 的 307 目的地改成 `/index.html`，舊路徑 `/legacy/index.html` 不保留相容。同步腳本目的地、測試、lint 忽略清單與文件跟著改。

**行為不變**：除了 `index.html` 的 4 個 `src` 屬性，所有搬動的檔案逐位元組相同。`npm test` 基準照舊：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 193／176／150。temp-core 不修改、部署防線不動，**仍不可部署**。

建議排在 3.5 之前，讓 3.5–3.8 直接沿用新路徑。

## 1. 目標與非目標

### 目標

1. `GET /index.html` → 200，就是現在的舊 Client，所有本站資源 200，沒有 404；`GET /` → 307 `Location: /index.html`。
2. `public/legacy/` 只剩 `temp-core/`（3.7 刪除後整個目錄消失）。
3. `scripts/sync-legacy-modules.mjs` 改寫到 `public/modules/`；B1 等測試改成新路徑並全部通過。
4. 測試防止退回舊結構：`public/legacy/` 只能有 `temp-core/`、`index.html` 不能再出現 `src="temp-core/`。
5. 文件裡現行狀態的路徑描述如實更新（第 11 節）。

### 非目標

- 移除或搬動 temp-core、修改 temp-core 內容（含檔頭註解）、移除部署防線：3.7。
- 讓 `/` 本身（不轉址）顯示頁面、`app/page.js`、React 化。
- 改名 `sync:legacy` 指令或 `sync-legacy-modules.mjs`（第 13 節第 4 點）。
- 頁面安全標頭／CSP、第三方資源釘版（4.1 前另開 Feature）、PWA manifest／service worker（Epic 5）。
- 改動 `js/*.js`、`modules/**`、`styles/main.css` 的內容；修改舊專案。
- 修改舊規格（`context/features/3-2`、`3-3`、`3-4` 等是歷史紀錄，路徑照舊）。

## 2. 現況盤點

基準：本專案 `master` `04dd6ce`，工作區乾淨，以 Grep／`ls` 取得。

### 2.1 `public/` 結構與頁面的本站資源引用

```
public/legacy/
  index.html                 # 90.1K
  js/{config,state,ui,renderer,pose,analyzer}.js
  styles/main.css            # 無 url()／@import（3.2 規格第 2 節）
  modules/bridge.js          # 手寫
  modules/{player,landmarks}/ # 同步產物（3.4）
  temp-core/{biomechanics,keyframes,landmark-extract,cycle-analysis}.js
```

`public/` 下沒有其他檔案。`index.html` 中所有非外部的 `src`／`href`（其餘是 CDN 或 `data:`）：

| 行 | 引用 | 解析基準 |
| -- | ---- | -------- |
| 65 | `href="styles/main.css?v=3.1"` | 相對 |
| 1324–1328 | `src="js/{config,state,ui,renderer,pose}.js"` | 相對 |
| 1329–1332 | `src="temp-core/{biomechanics,keyframes,landmark-extract,cycle-analysis}.js"` | 相對 |
| 1333 | `src="js/analyzer.js"` 與 `<script type="module" src="modules/bridge.js">` 同一行 | 相對 |

- `bridge.js` 只 import `./player/index.js`、`./landmarks/index.js`；`modules/**` 內只有同目錄相對 import（3.4 測試把關）。
- `js/analyzer.js:259` 的 `fetch("/api/analyze")` 是**絕對路徑**，與頁面位置無關。
- `js/pose.js:37–38` 的 MediaPipe `locateFile` 指向 jsdelivr 絕對網址，與頁面位置無關。
- 因此只要頁面與 `js/`、`styles/`、`modules/` 保持相同的相對位置，就不需要改任何引用；唯一跟著位置變的是 temp-core 的 4 行。

### 2.2 `/legacy` 路徑出現處（不含 `context/features/` 舊規格、`node_modules`）

| 檔案 | 位置 | 內容 | 3.9 |
| ---- | ---- | ---- | --- |
| `next.config.mjs` | :3–7 | 部署防線檢查 `./public/legacy/temp-core` | **不動**（temp-core 不搬） |
| `next.config.mjs` | :12–15 | `redirects()`：`/` → `/legacy/index.html` | 目的地改 `/index.html`，註解更新 |
| `eslint.config.mjs` | :13–14 | `globalIgnores` 含 `public/legacy/**` | 改成三個目錄（第 6.5 節） |
| `scripts/sync-legacy-modules.mjs` | :1、:9、:52 | `DEST = public/legacy/modules`，註解與完成訊息 | 改 `public/modules` |
| `public/legacy/modules/bridge.js` | :1 | 註解提到同步腳本，沒有路徑 | 只搬，不改 |
| `public/legacy/temp-core/*.js` | 各檔 :2 | 檔頭「只由 public/legacy/index.html 以 script 載入」 | **不改**（不得修改），描述從此過時，見第 12 節 |
| `tests/legacy-client.test.js` | 多處 | 第 2.3 節 | 改 |
| `tests/browser-modules.test.js` | :1、:136–158 | B1 副本路徑 | 改 |
| `AGENTS.md` | :13 | `public/legacy/temp-core/` | 不改（仍正確） |
| `AGENTS.md` | :62 | `public/legacy/js/config.js` | 須改成 `public/js/config.js`（第 14 節第 1 點） |
| `README.md` | :3、:9 | `:3` 提 temp-core（仍正確）；`:9` 提 `/legacy/index.html`、`public/legacy/modules/` | `:9` 改 |
| `docs/privacy.md` | :15、:49、:65、:75、:89、:91 | 頁面路徑、`analyzer.js`、儲存檢查範圍、同步副本 | 改（`:17` 提 temp-core，仍正確） |
| `docs/client-server-boundary.md` | :20、:178 | 舊 Client 位置、橋接副本位置 | 改 |
| `docs/planning/epics-and-features.md` | :54、:56、:59、:61、:67 | 3.2／3.4 歷史描述、3.7／4.1 提 temp-core、3.9 列 | 只改 3.9 列（其餘為歷史或仍正確） |
| `package.json` | :16 | `sync:legacy` | 不改 |

`lib/`、`app/` 不含 `public/legacy` 字樣（`tests/legacy-client.test.js:36–42` 把關）。`docs/server-api.md`、`docs/analysis-json-contract.md` 沒有頁面路徑（後者的 `legacy` 指舊格式 JSON，無關）。`app/` 只有 `layout.js`、`icon.svg`、`api/analyze/route.js`，**沒有 `app/page.js`、沒有 `pages/`**。

### 2.3 `tests/legacy-client.test.js` 中的路徑

| 行 | 斷言 | 3.9 |
| -- | ---- | --- |
| 23–29 | `public/legacy/temp-core/` 恰好四檔、`TEMP-CORE` 檔頭 | 不變 |
| 31–34 | 核心檔名不在 `public/legacy/js/` | 改 `public/js/` |
| 36–42 | `app/`、`lib/` 不含 `temp-core`、`public/legacy` | 不變 |
| 44–49 | `next.config.mjs` 只在防線提 `temp-core` | 不變 |
| 51–57 | `index.html` 以 `src="temp-core/${f}"` 載入 | 改讀 `public/index.html`、`src="legacy/temp-core/${f}"` |
| 61–64 | `public/legacy/js/config.js` 版本 | 改 `public/js/config.js` |
| 66–97、117–122 | 儲存／外送通道、`fetch` 一處、`customCycleFrames`：掃 `public/legacy/**` 與其 `index.html` | 改掃 `public/**/*.js` 與 `public/index.html`；`fetch` 唯一命中改為 `public/js/analyzer.js` |
| 99–115 | `analyzer.js`、`state.js` 內容 | 改 `public/js/…` |
| 124–131 | `public/**/*.js` 核心字串只在 `public/legacy/temp-core/` | 只改 `index.html` 路徑 |
| 159–166 | C1 讀 `public/legacy/temp-core/` | 不變 |
| 168–174、176–191、193–203 | C2 讀 `index.html`；C3 掃 `public/legacy/js/`；C4 掃 `public/legacy/modules/` | 改新路徑 |
| 219–225 | `redirects()` 等於 `/` → `/legacy/index.html` | 改 `/index.html` |

注意：66–97 改掃 `public/**` 後，範圍反而**變大**（包含 temp-core 與 modules，跟現在一樣，因為現在 `public/legacy/**` 也包含它們）。

## 3. Next.js 16.4.6 查證

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`：`public/` 檔案從根路徑原樣提供（含 `.html`），不經 bundler。**只有與 `pages/` 目錄同名的 public 檔會衝突**（`conflicting-public-file-page`）；本專案沒有 `pages/`，App Router 也沒有 `app/page.js`，`public/index.html` 不會與任何路由衝突。
- Next 不會自動把 `public/index.html` 當成 `/` 的回應（`node_modules/next/dist/server`、`lib` 中沒有對 `index.html` 的特別處理；以 Verification 第 3 步實測）。所以 `/` 仍需要 `redirects()`。
- `redirects()` 在檔案系統（`public/`）之前執行，`permanent: false` 回 307（3.2 規格已查證）。
- `rewrites`：若把 `/index.html` 改寫到 `/legacy/index.html`，瀏覽器網址仍是 `/index.html`，頁面的相對路徑會解析成 `/js/…`、`/styles/…`、`/modules/…`、`/temp-core/…` 而 404（3.2 規格第 1 節同一問題）。
- `next.config.mjs` 的 `headers()` 只套用 `/api/:path*`，頁面與靜態檔照舊沒有安全標頭（既有限制，4.1 前另開 Feature）。
- start 時仍須依 AGENTS 重讀上述頁面與 `redirects.md`，確認沒有新的 deprecation。

## 4. 作法比較：**整包搬到根目錄，temp-core 留在原處**

| 選項 | 作法 | 評估 |
| ---- | ---- | ---- |
| **A2. 搬到根目錄，temp-core 不動（建議）** | `git mv` `index.html`、`js/`、`styles/`、`modules/` 到 `public/`；`index.html:1329–1332` 改成 `src="legacy/temp-core/…"`；`/` → `/index.html` | 網址與檔案位置一致，相對路徑天然正確；temp-core 的位置、部署防線、`AGENTS.md:13`、C1、temp-core 隔離測試都不動；3.7 刪除 temp-core 時 `public/legacy/` 整個消失，結構自然收斂。代價：`index.html` 改 4 個 `src`（行數不變）；temp-core 檔頭「只由 public/legacy/index.html 載入」從此過時（不得修改，只能在文件註記） |
| A1. 整包搬（含 temp-core 到 `public/temp-core/`） | `public/legacy/*` 全搬到 `public/`；`index.html` 完全不改 | `index.html` 零修改是優點，但要改部署防線的路徑與錯誤訊息、`AGENTS.md:13` 的過渡期規則、C1 與 temp-core 隔離測試、3.7／4.1 路線圖與多份文件中的 temp-core 路徑；防線路徑改錯會讓「不得部署」失效。temp-core 只剩 3.5–3.7 的壽命，為它搬家改規則不划算。檔頭同樣過時 |
| B. 只加 `/index.html` 轉址 | `redirects` `/index.html` → `/legacy/index.html` | 瀏覽器最後停在 `/legacy/index.html`，**不滿足需求**（網址不是 `/index.html`） |
| B'. 只加 `/index.html` 改寫（rewrite） | `rewrites` `/index.html` → `/legacy/index.html` | 網址是 `/index.html`，但相對路徑全部 404（第 3 節）；要嘛再加 `/js/:path*`、`/styles/:path*`、`/modules/:path*`、`/temp-core/:path*` 四條改寫（根路徑被舊 UI 的目錄名佔用，卻看不出來源），要嘛在 `index.html` 加 `<base href="/legacy/">`（`?v=`、module 解析、日後 PWA scope 都要跟著推理）。檔案與網址不一致會讓 3.5–3.8 與 Epic 5 繼續沿用 `/legacy`，正是路線圖想避免的。不採用 |

採 A2 後的 `public/`：

```
public/
  index.html                  # 搬入；只改 :1329–1332 的 src
  js/{config,state,ui,renderer,pose,analyzer}.js   # 搬入，不改
  styles/main.css             # 搬入，不改
  modules/bridge.js           # 搬入，不改
  modules/{player,landmarks}/ # 搬入，之後由同步腳本維護
  legacy/temp-core/*.js       # 不動（3.7 刪除）
```

## 5. 範圍

```
public/
  index.html               # git mv 自 public/legacy/index.html；:1329–1332 同行替換 src="temp-core/ → src="legacy/temp-core/（行數不變）
  js/                      # git mv 自 public/legacy/js/（6 檔，內容不變）
  styles/                  # git mv 自 public/legacy/styles/（內容不變）
  modules/                 # git mv 自 public/legacy/modules/（內容不變）
next.config.mjs            # 修改：redirects() 目的地 /index.html，註解改寫；部署防線不動
eslint.config.mjs          # 修改：globalIgnores 的 "public/legacy/**" 換成三項（第 6.5 節）
scripts/sync-legacy-modules.mjs  # 修改：DEST 改 public/modules；註解與完成訊息
tests/legacy-client.test.js      # 修改：第 2.3 節路徑；新增第 8 節 E
tests/browser-modules.test.js    # 修改：B1 路徑與檔頭註解
AGENTS.md                  # 修改（待同意，第 14 節第 1 點）：:62 路徑
README.md、docs/privacy.md、docs/client-server-boundary.md、docs/planning/epics-and-features.md
context/current-feature.md # Notes
```

- **不修改**：`public/legacy/temp-core/**`、`lib/**`、`app/**`、`package.json`、`vitest.config.mjs`、`public/js/*.js`、`public/modules/**`、`public/styles/main.css` 的內容、`next.config.mjs` 的防線與 `headers()`。
- **不新增依賴、不新增 npm script。**
- **行號**：所有搬動檔案的行號不變，決策文件與舊規格中的 `index.html:NNNN`、`js/analyzer.js:NNN` 行號引用仍有效，只有目錄前綴改變。

## 6. 設計決策

### 6.1 搬動方式

- 一律用 `git mv`（保留歷史，`git log --follow` 可追溯）。搬完先 commit 前檢查 `git diff -M --cached --stat`：除 `index.html` 外全部是 100% rename。
- `index.html` 的 4 行替換用精確字串（`src="temp-core/` → `src="legacy/temp-core/`），恰好 4 處；不碰其他字元，保留 CRLF。

### 6.2 `/` 的處理：**保留 307，目的地改 `/index.html`**

- `/` 沒有 `app/page.js`，Next 也不會自動回 `public/index.html`，所以仍需轉址。使用者要的網址是 `/index.html`，轉址後網址列就是它。
- 不用 rewrite 讓 `/` 直接顯示頁面：rewrite 本身可行（相對路徑在根目錄解析一致），但同一頁有兩個網址，且非使用者要求；`/` 未來可能給 React 頁面，保持「`/` 只是轉址」較容易替換。
- `permanent: false`（307）：過渡期設定，不讓瀏覽器永久快取。

### 6.3 舊路徑 `/legacy/index.html`：**不保留相容**

- 本專案從未部署（Epic 4 前），舊路徑只出現在本機書籤與歷史規格，沒有外部使用者。
- 保留一條 `/legacy/index.html` → `/index.html` 的轉址雖然成本低，但會多一個 3.7／React 化時要記得移除的東西，且 `/legacy/` 底下還有 temp-core，不能用 `/legacy/:path*` 這種寬鬆規則。
- 結果：`GET /legacy/index.html` → 404；`/legacy/temp-core/*.js` 照舊 200（頁面需要它）。替代方案見第 13 節第 2 點。

### 6.4 同步腳本

- 只改 `DEST`（`join(ROOT, "public", "modules")`）、檔頭註解與完成訊息；`MANAGED`、自我檢查、「先刪受管理子目錄再複製」的行為不變。
- 搬完後立即執行 `npm run sync:legacy`，`git status` 應無差異（副本已隨 `git mv` 到位）。
- 腳本與指令名稱保留 `legacy`：這裡的 legacy 指「舊 UI（React 化前）」，不是 `/legacy` 路徑；改名會牽動 README、`docs/privacy.md`、測試提示訊息與使用者習慣，沒有功能上的好處（第 13 節第 4 點）。

### 6.5 lint 忽略

`public/legacy/**` 換成：

```js
// 舊全域 script（3.2 原樣搬入，3.9 移到 public/ 根目錄）與同步副本；React 化時移除忽略
"public/js/**",
"public/modules/**",
// 暫時核心（3.7 刪除）
"public/legacy/**",
```

不用 `public/**`：Epic 5 會在 `public/` 放 service worker 等新 script，應該受 lint 檢查，不應被一條寬鬆規則悄悄忽略。

### 6.6 與後續 Feature 的關係

- 3.5–3.8：直接改 `public/index.html`、`public/js/*`、`public/modules/*`。
- 3.7：刪除 `public/legacy/temp-core/` 時同時刪 `index.html` 的 4 行與部署防線，`public/legacy/` 消失，lint 的 `public/legacy/**` 一併移除。
- Epic 5：頁面在根目錄，service worker 放 `public/sw.js` 即可取得 scope `/`（不需 `Service-Worker-Allowed` 標頭），manifest `start_url` 可設 `/index.html`。

## 7. 實作步驟

1. 開 branch `feature-root-index-html`；依 AGENTS 重讀第 3 節 Next 文件。
2. `git mv public/legacy/{index.html,js,styles,modules} public/`。
3. `public/index.html` 4 行替換；`next.config.mjs` 轉址；`eslint.config.mjs`；`scripts/sync-legacy-modules.mjs`。
4. 執行 `npm run sync:legacy`，確認 `git status` 中 `public/modules/` 沒有內容差異。
5. 改測試（第 8 節），跑 `REQUIRE_BASELINE=1 npm test`、build、lint。
6. 依 Verification 做 HTTP 與 Playwright 檢查；更新文件（第 11 節）；Notes 寫入 `context/current-feature.md`。

## 8. 測試計畫

**既有測試**：全部照舊通過，基準不變：`REQUIRE_BASELINE=1 npm test` → walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、landmarks 193／176／150。本 Feature 不碰 `lib/`，baseline 通過是預期結果，不是新證據；行為不變的證據是第 9 節第 2 點的 rename 檢查與 Playwright。

**`tests/legacy-client.test.js`（修改）**：依第 2.3 節逐條改路徑，斷言的意義不變。另新增：

- **E1 結構**：`public/legacy/` 底下只有 `temp-core`（`readdirSync` 等於 `["temp-core"]`）；`public/index.html`、`public/js/`、`public/styles/main.css`、`public/modules/bridge.js` 存在；`public/legacy/index.html`、`public/legacy/js`、`public/legacy/modules` 不存在。
- **E2 temp-core 引用**：`public/index.html` 中 `src="legacy/temp-core/${f}"` 各恰好一次，且不含 `src="temp-core/`（避免回到失效的相對路徑）。
- **E3 轉址**：`redirects()` 等於 `[{ source: "/", destination: "/index.html", permanent: false }]`（取代 219–225 的期望值），不含任何 `/legacy` 來源或目的地。
- 檔頭註解第 1–2 行加一句「3.9 起頁面在 `public/` 根目錄，temp-core 仍在 `public/legacy/temp-core/`」。

**`tests/browser-modules.test.js`（修改）**：B1 兩個 `it` 的 `public/legacy/modules/` 改成 `public/modules/`；`describe` 名稱與檔頭註解同步。斷言內容不變。

**驗證測試會抓到錯誤**（start 時做一次、記錄後還原）：把 `public/index.html` 一個 `src="legacy/temp-core/` 改回 `src="temp-core/`，E2 失敗；改 `lib/player/stride-input.js` 一個字元，B1 失敗並提示 `npm run sync:legacy`。

## 9. 驗收標準

1. `GET /` → 307 `Location: /index.html`；`GET /index.html` → 200，頁面標題與 3.4 相同；`GET /legacy/index.html` → 404。
2. `git diff -M --stat master` 中，`public/legacy/{js,styles,modules}/**` → `public/…` 全為 100% rename；`public/legacy/index.html` → `public/index.html` 只有 4 行變更；`git diff --stat master -- public/legacy/temp-core lib app package.json` 為空；`next.config.mjs` 的防線兩行未變。
3. `REQUIRE_BASELINE=1 npm test` 全過，基準數值不變；E1–E3 與改路徑後的既有斷言全過。
4. `npm run sync:legacy` 執行後 `git status` 無差異。
5. 頁面所有本站資源（`/styles/main.css?v=3.1`、`/js/*.js`、`/legacy/temp-core/*.js`、`/modules/**`）200，`.js` 為 JavaScript MIME；`window.RFA` 在 `DOMContentLoaded` 時已存在。
6. 影片擷取、切換 Profile、播放骨架、拖入影片、匯入 walk JSON（103／361ms／96）、手動步幅、無影片預覽都與 3.4 相同；console 沒有 error，沒有 404。
7. `VERCEL=1 npm run build` 仍失敗（訊息含 `temp-core`）。
8. 文件依第 11 節更新；舊規格未修改。

## 10. Verification

依 `AGENTS.md` 順序執行，結果寫入 Notes。

1. `npm run build`、`npm run lint`（確認 `public/js/**`、`public/modules/**`、`public/legacy/**` 被忽略，`lib/`、`scripts/` 照舊受檢）。另跑 `VERCEL=1 npm run build`，預期失敗。
2. `REQUIRE_BASELINE=1 npm test` 記錄基準數值；再跑一次不帶變數的 `npm test`；執行第 8 節的兩個「故意改錯」檢查並還原。
3. HTTP（`npm run dev`，`curl -i`）：
   - `GET /` → 307，`Location: /index.html`。
   - `GET /index.html` → 200，`Content-Type: text/html`。
   - `GET /legacy/index.html`、`/legacy/js/analyzer.js`、`/legacy/modules/bridge.js` → 404。
   - `GET /js/analyzer.js`、`/styles/main.css?v=3.1`、`/legacy/temp-core/biomechanics.js`、`/modules/bridge.js`、`/modules/player/index.js`、`/modules/landmarks/landmark-extract.js` → 200，記錄 `Content-Type`。
   - 同源樣本 `POST /api/analyze` → 200，5 個安全標頭不變。
4. **bundle 檢查**（一次性腳本放 scratchpad）：`.next/static/` 搜尋 3.4 第 8 節 A2 的核心字串，預期零命中；`public/` 搜尋同一組字串，預期只命中 `public/legacy/temp-core/`，命中數與 3.4 Notes 相同。
5. **Playwright：載入**（直接開 `http://localhost:3000/index.html`，另開一次 `http://localhost:3000/` 確認落在 `/index.html`）
   - `page.addInitScript` 記錄 `DOMContentLoaded` 當下 `!!window.RFA`，預期 `true`；`Object.isFrozen(window.RFA)`。
   - 收集所有 response：本站請求沒有 4xx／5xx，沒有對 `/legacy/index.html`、`/legacy/js/`、`/legacy/modules/` 的請求，temp-core 的 4 個請求都是 `/legacy/temp-core/*.js` 200。
   - console 沒有 error（Tailwind CDN warning 允許）。
6. **Playwright：互動回歸**（AGENTS 第 4 項）：用 `woman03 - Trim.mp4` 擷取，即時 HUD 與同步骨架更新，恰好一個 `POST /api/analyze` → 200，`custom_captured` 有 101 幀關鍵幀；切換 Profile（`hsu_pose_method` → `night_track_runner` → `custom_captured` → 匯入的 `json_*`）；播放／暫停骨架、相位跳轉、圖層切換；拖入影片（`#videoDropZone` drop）；匯入 walk JSON 顯示 103／361ms／96；手動步幅 `1.1` 後配速更新、`abc` 被忽略；無影片的模擬擷取與徐國峰預覽。
7. 文件核對（第 11 節逐條）；`git status` 只有本 Feature 的檔案，`.temp/` 未提交。

## 11. 文件同步

| 文件 | 修改 |
| ---- | ---- |
| `README.md` | `:9`：「`/` 導向舊 Client（`/index.html`，檔案在 `public/` 根目錄；暫時核心仍在 `public/legacy/temp-core/`，**3.7 完成前不可部署**）」；`npm run dev` 後開 `http://localhost:3000/index.html`；同步目的地改 `public/modules/`。`:3` 不變 |
| `docs/privacy.md` | `:15` `/` 導向 `/index.html`、檔案在 `public/`（`public/legacy/` 只剩 temp-core）；`:49` 改 `public/js/analyzer.js`；`:65` 改 `public/index.html`；`:75` 檢查範圍改「`public/` 下本站檔案」；`:89`、`:91` 改新路徑。`:17` 不變 |
| `docs/client-server-boundary.md` | `:20`：「3.2 起搬入 `public/legacy/`，**3.9 起**頁面、`js/`、`styles/` 移到 `public/` 根目錄（行號不變）；舊核心仍在 `public/legacy/temp-core/`，其檔頭『只由 public/legacy/index.html 載入』已過時（檔案不得修改），實際由 `public/index.html` 以 `legacy/temp-core/…` 載入」；`:178` 橋接副本改 `public/modules/` |
| `docs/planning/epics-and-features.md` | 3.9 列改為 `done`，一句結論並連到本規格。3.2、3.4 列是當時的歷史描述，不改；3.7、4.1 提 temp-core 的路徑仍正確 |
| `AGENTS.md` | `:62` `public/legacy/js/config.js` → `public/js/config.js`（第 14 節第 1 點）；`:13` 不變 |

## 12. 風險與已知限制

- **temp-core 檔頭過時**：四個檔第 2 行寫「只由 public/legacy/index.html 以 script 載入」，3.9 後實際載入者是 `public/index.html`。依 AGENTS 不得修改，只在決策文件註記；3.7 刪檔後消失。A1 同樣有這個問題，不是 A2 特有。
- **根路徑名稱被佔用**：`/js`、`/styles`、`/modules`、`/legacy` 從此是 public 目錄。日後若在 `app/` 建立同名路由會衝突；React 化時這些目錄會被移除或改由 bundler 產出，屆時一併處理。
- **舊書籤失效**：`/legacy/index.html` 回 404（第 6.3 節，刻意）。
- **瀏覽器快取**：`/` 從前是 307 到 `/legacy/index.html`，307 不會被永久快取，不受影響。`public/` 預設 `max-age=0`，搬家後不會讀到舊檔。
- **同步副本路徑**：若有人在別的 branch 上仍以舊 `DEST` 執行同步，會重新生出 `public/legacy/modules/`；E1 會失敗並指出。
- **仍不可部署**：3.9 完成不代表可以進 4.1。

## 13. 待決定（start 時先採預設）

1. **作法**：搬到根目錄、temp-core 不動（**建議**，第 4 節 A2）／整包含 temp-core 一起搬（A1）／rewrite（B'，不建議）。
2. **舊路徑 `/legacy/index.html`**：不保留，404（**建議**，第 6.3 節）／保留一條精確的 307 `/legacy/index.html` → `/index.html` 到 3.7。
3. **`/`**：保留 307 到 `/index.html`（**建議**，第 6.2 節）／改成 rewrite，讓 `/` 直接顯示同一頁。
4. **同步腳本與指令名稱**：保留 `sync-legacy-modules.mjs`、`sync:legacy`（**建議**，第 6.4 節）／改名（例如 `sync:modules`），連動 README、`docs/privacy.md`、測試提示。
5. **lint 忽略**：三個明確目錄（**建議**，第 6.5 節）／`public/**`。

## 14. 未決事項（不阻擋開工，需要使用者回答）

1. `AGENTS.md:62` 寫的是 `public/legacy/js/config.js`，搬家後路徑錯誤。是否同意把這一處改成 `public/js/config.js`？（只改路徑，不改規則；不同意時 AGENTS 會留著錯誤路徑，測試仍會把關版本同步。）
2. 第 13 節第 2 點：是否需要保留 `/legacy/index.html` 的相容轉址（例如你有書籤或其他工具指向舊網址）？預設不保留。
