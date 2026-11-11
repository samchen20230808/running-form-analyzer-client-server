# Feature 2.2 — 隱私說明與文件

## Status

`done`

## Epic

Epic 2 — 存取控制（同源）

## Objective

把散落在 `docs/server-api.md`「隱私」一節與 2.1 規格中的隱私承諾，整理成**一份與程式實際行為逐項一致**的說明，並補上專案入口文件：

- **新增 `docs/privacy.md`**：說明傳了什麼、Server 拿來做什麼、留下什麼、留多久、誰還看得到（部署平台、未來的第三方 CDN）。每一項都要能對應到程式碼位置。
- **新增 `README.md`**（目前不存在，見「現況盤點」）：專案簡介、目前狀態、開發指令、文件索引、隱私摘要（連到 `docs/privacy.md`）。
- **更新 `docs/server-api.md`**：「隱私」一節改為摘要並連到 `docs/privacy.md`；**修正與程式不一致的描述**（IP 過期即丟棄，見第 3 節）；限流限制維持如實記載。
- **必要時微調程式註解**，讓註解與文件用詞一致；**不改任何行為**。
- **新增文件一致性測試** `tests/privacy-docs.test.js`：把「只有一處 log」「不讀 env、不寫檔、不對外連線」「文件中的限流數值與 `ACCESS_LIMITS` 相同」「README 版本與 `APP_CONFIG.version` 相同」變成會失敗的測試，避免日後文件與程式漂移。

**行為零變更**：不修改 `lib/core/`、`lib/server/analyze.js`、`lib/server/validate-request.js`、`lib/contract/`、`next.config.mjs` 的設定值；`lib/server/access-control.js`、`lib/server/http-handler.js`、`app/api/analyze/route.js` 只允許改註解。基準 walk 103／361ms／96、三份 landmarks 193／176／150 照舊通過。

## 程式實際行為盤點（文件必須與此一致）

以下為撰寫本規格時對程式碼的唯讀查證結果（commit `389c36f`）。實作時若程式已變動，以實際程式為準並同步修改文件。

| 主題 | 程式位置 | 實際行為 |
| ---- | -------- | -------- |
| 上傳內容 | `docs/server-api.md`「請求」、`lib/server/validate-request.js` | `frameWidth`、`frameHeight`、`heightCm`、`cameraMode`、`runDirection`、`isManualDirection`、`profileName`（選填，≤ 200 字）、`frames[]`（每幀 `t` 與 33 點 `[x, y, visibility]`）。**沒有影片、影像或音訊欄位**。 |
| body 讀取 | `lib/server/http-handler.js` `readLimitedText` | 串流讀入記憶體、上限 4 MB，超過即 `cancel`；`JSON.parse` 後交給 `analyzeRequest`。函式結束後不保留任何參照（無模組層級快取）。 |
| 寫入儲存 | `app/`、`lib/` 全部 | 無 `fs` 寫入、無資料庫、無外部儲存、無 cookie、無 `process.env`、無對外 `fetch`（grep 確認）。 |
| log | `lib/server/http-handler.js` 第 100 行 | 唯一的 log：非預期例外時 `console.error("analyze failed")`，**固定字串、不帶 error 物件、stack、IP 或請求內容**。403／429／4xx 都不 log。 |
| 回應內容 | `lib/server/analyze.js` | 回傳衍生結果（`summary`、`metrics`、`phaseTiming`、101 幀 `cycleKeyframes` 等）＋原樣帶回 `heightCm`、`cameraMode`，以及有提供時的 `profileName`；附 Server 產生的 `timestamp`。**不回傳原始 landmarks**。 |
| 回應快取 | `RESPONSE_HEADERS`、`next.config.mjs` | 所有 `/api` 回應 `Cache-Control: no-store`、`Referrer-Policy: no-referrer` 等 5 個標頭；無 CORS。 |
| IP 用途 | `lib/server/access-control.js` `getClientIp`／`hit` | 只用於限流。取 `x-forwarded-for` 第一段 → `x-real-ip` → 共用桶 `"unknown"`；**以明文字串作為記憶體 `Map` 的鍵**，值為 `{ count, resetAt }`。不 log、不寫檔、不回傳給 client。 |
| IP 保留期間 | `access-control.js` `hit`／`evict` | **視窗過期時不會立刻刪除**。一筆紀錄只在以下情況消失：(a) 同一 IP 在過期後再次請求（`delete` 後重建）；(b) `Map` 已達 10,000 筆、要新增時觸發 `evict`（先清過期、仍滿再刪最舊）；(c) serverless instance 回收或冷啟動（記憶體清空）；(d) 測試呼叫 `reset()`。因此**最長保留到該 instance 結束**，不是「60 秒後」。 |
| 限流參數 | `ACCESS_LIMITS` | `windowMs: 60_000`、`maxRequests: 30`、`maxTrackedIps: 10_000`、`maxIpLength: 45`。 |
| 標頭讀取 | `access-control.js` | 只讀 `sec-fetch-site`、`origin`、`host`、`x-forwarded-for`、`x-real-ip`；不讀 body、不讀 cookie／`Authorization`。 |
| 頁面（`/`） | `app/page.js`、`app/layout.js` | 目前是佔位頁，只顯示 `APP_CONFIG.systemName`／`version`；**不載入 MediaPipe、不載入第三方資源、不呼叫 API、不使用 localStorage**。 |
| 部署平台 | Vercel（4.1 尚未部署） | 平台本身可能記錄請求 metadata（時間、路徑、狀態碼、IP、User-Agent 等），不在本程式控制範圍；保留期限依 Vercel 方案與政策，4.1 查證。 |

### 文件與程式目前的不一致（本 Feature 要修正）

1. `docs/server-api.md`「隱私」：「IP …視窗過期或被擠出後即丟棄」**不正確**——過期筆不會主動清除（見上表「IP 保留期間」）。改為如實描述。
2. `lib/server/access-control.js` 第 3 行註解「不記錄 IP 與標頭」語意模糊（「記錄」可被理解為「不在記憶體中保存」）。改為「不寫入 log、不持久化；IP 僅以明文作為記憶體 Map 的鍵（限流用）」。
3. 專案沒有 `README.md`（1.1 Notes 已記錄；2.1 規格選擇不新增）。2.2 依路線圖新增。

## 舊專案參考（唯讀）

| 舊檔 | 內容 | 本 Feature 處理 |
| ---- | ---- | ---- |
| `README.md` 第 17 行 | 隱私摘要：只上傳 landmarks、Server 不儲存不記錄，連到 `docs/server-api.md#隱私` | 用語沿用；連結改到 `docs/privacy.md`；刪去 API Key 相關敘述 |
| `docs/server-api.md`「隱私」 | Vercel 平台會在其 log 記錄請求 metadata（時間、路徑、狀態碼、IP 等）；程式不記錄 body 與 key | 沿用平台 log 的說法；本專案無 key |
| `context/features/2-4-access-control-rate-limit.md` | `profileName` 可能含檔名（個人資訊），只原樣帶回、不保存；隱私說明不放在 Client 畫面 | 沿用；UI 上的隱私提示留給 3.3 |
| `index.html`、`js/pose.js` | MediaPipe 由 `cdn.jsdelivr.net` 載入；字型由 `fonts.googleapis.com` 載入 | 本專案尚未搬入；`docs/privacy.md` 記為「3.2 搬入後須更新」 |

## 範圍

### 目錄與檔名

```
README.md                       # 新增
docs/
  privacy.md                    # 新增：隱私說明正本
  server-api.md                 # 更新：「隱私」改摘要＋連結、修正 IP 保留描述
  planning/epics-and-features.md  # 2.2 狀態與說明（/feature complete 時）
lib/server/
  access-control.js             # 只改註解（第 2–4 行檔頭）
  http-handler.js               # 視需要只改註解
app/api/analyze/route.js        # 視需要只改註解
tests/
  privacy-docs.test.js          # 新增：文件與程式一致性
```

- 不新增 npm 依賴、不改 `package.json`、不改 `next.config.mjs` 的值。
- 程式檔的 `git diff` 只能出現註解行。

### 非範圍

- 修改演算法、`LIMITS`、`ACCESS_LIMITS`、契約、回應形狀或任何狀態碼。
- 改變 IP 的保存方式（例如雜湊、過期主動清除、計時器清理）——屬行為變更，見「未決事項」。
- 頁面（`/`）的隱私提示 UI、Client 是否送出 `profileName`（3.3）。
- 頁面 CSP、第三方 CDN 自託管（3.2）。
- 正式的法律文件（隱私權政策、服務條款、個資法／GDPR 告知義務）。`docs/privacy.md` 是技術性說明，不是法律文件。
- 部署、Vercel 設定、查詢 Vercel log 保留期限（4.1，由使用者操作）。
- 修改舊專案；提交 `.temp/`。

## 設計決策

### 1. 單一正本分工

- **`docs/privacy.md`** 是「資料如何被處理」的正本：上傳什麼、用途、保留、log、第三方。
- **`docs/server-api.md`** 仍是「限流與存取控制技術細節」的正本（規則表、參數、盡力而為的原因）。
- 兩者互相連結，不複製大段內容；`docs/privacy.md` 中與限流相關的只寫「IP 用於什麼、保留多久」與一句「限流僅盡力而為，細節見 server-api.md」。
- `README.md` 只放 3–5 行摘要＋連結。

理由：同一段說明寫在三處必然漂移（2.1 已出現一次 IP 保留描述錯誤）。數值仍會在多處出現，由第 4 節的測試把關。

### 2. `docs/privacy.md` 章節

以繁體中文撰寫，每個承諾後面以括號標出對應程式位置（檔名＋函式），方便 review 對照。

1. **摘要**（3–5 點）：影片不離開瀏覽器（Epic 3 起）；Server 只收 landmarks 等數值；不儲存、不寫 log（唯一例外為固定字串）；IP 只在記憶體中用於限流；部署平台可能另有 log。
2. **目前狀態**：Client 尚未搬入（Epic 3），目前頁面不擷取影像、不呼叫 API、不載入第三方資源；本文件描述的 Client 端行為（影片在瀏覽器內以 MediaPipe 處理、只上傳 landmarks）是設計目標，3.2／3.3 完成時須重新核對本文件。
3. **上傳的資料**：欄位表（名稱、意義、是否原樣帶回）。註明 landmarks 是 33 個關節點的正規化座標與可見度＋時間，**不是影像**，但仍屬可描述身體動作的資料；`heightCm` 是使用者輸入的身高；`profileName` 可能含影片檔名，**請勿放入個人資訊**（會原樣出現在回應與匯出的 JSON 中）。
4. **Server 如何處理**：記憶體中解算、回應後即不再持有；不寫入檔案、資料庫或外部服務；回應 `Cache-Control: no-store`；不回傳原始 landmarks。
5. **記錄（log）**：程式唯一的 log 是 500 時的 `analyze failed`（不含任何請求資料、IP 或錯誤細節）；403／429／4xx 不 log。另註明 Next.js 開發伺服器（`next dev`）自身會在終端機印出請求路徑與狀態碼，這是框架行為，不含 body 與 IP（Verification 第 4 步確認後再寫入；若實測不同，以實測為準）。
6. **IP 位址與限流**：用途（只為限流）、取得方式（摘要）、以明文存在單一 instance 的記憶體 `Map`、**保留期間如實寫明**（第 3 節），不 log、不持久化、不與其他資料關聯、不回傳。限流僅盡力而為，連到 `docs/server-api.md#限流`。
7. **部署平台**：部署在 Vercel 時，平台可能記錄請求 metadata（時間、路徑、狀態碼、IP、User-Agent 等），依 Vercel 的隱私政策與方案保留；本程式無法控制，4.1 部署後補上查證結果。
8. **第三方資源**：目前無。註明舊 Client 由 `cdn.jsdelivr.net` 載入 MediaPipe、由 Google Fonts 載入字型，若 3.2 沿用，瀏覽器會直接連到這些第三方（對方可見 IP 與 User-Agent），屆時須更新本節或改為自託管。
9. **Cookie 與瀏覽器儲存**：目前不使用 cookie、localStorage 或追蹤／分析工具。
10. **日後可能改變的情況**（變更時必須同步本文件）：限流改用外部儲存（Upstash Redis，IP 會存到第三方）、加入 Turnstile 或登入、Client 搬入（3.2）、Client 開始上傳（3.3）、部署（4.1）。
11. **文件與程式的一致性**：說明 `tests/privacy-docs.test.js` 檢查哪些項目。

### 3. IP 保留期間的寫法

`docs/privacy.md` 與 `docs/server-api.md` 使用一致說法（文字可微調，但事實不可改）：

> IP 只以明文作為限流計數的鍵，存在單一 serverless instance 的記憶體中，不寫入 log、檔案或任何外部服務。視窗（60 秒）過期後計數不再生效，但該筆紀錄要等到同一 IP 再次請求、追蹤筆數達 10,000 筆觸發清理，或 instance 被回收時才會從記憶體移除；因此最長可能保留到該 instance 結束為止。

- 不寫「60 秒後刪除」或「即丟棄」。
- 不承諾 instance 的存活時間（由 Vercel 決定）。

### 4. 一致性測試 `tests/privacy-docs.test.js`

只讀檔案與 import 常數，不需要樣本，永遠執行。去註解的方式比照 `tests/core-modules.test.js` 的 `stripComments`（在新檔內自行定義，不修改既有測試檔）。

**程式側（掃描 `app/` 與 `lib/` 下所有 `.js`，去註解後）**

1. `console.` 只出現一次，位於 `lib/server/http-handler.js`，且完整呼叫為 `console.error("analyze failed")`（不帶第二個參數）。
2. 不出現 `process.env`、`node:fs`、`from "fs"`、`writeFile`、`appendFile`、`createWriteStream`、`fetch(`、`cookies(`、`localStorage`、`sessionStorage`、`indexedDB`。
3. 回應不含原始 landmarks：對 `.temp/json/` 的 landmarks 樣本呼叫 `analyzeRequest`，斷言 `Object.keys(result)` 不含 `frames`、`lm`，且 `JSON.stringify(result)` 不含 `"lm":`（注意 `cycleKeyframes.frames` 是合法的衍生關鍵幀角度，不可用「整份 JSON 不含 `"frames"`」來判斷）。缺樣本時比照 `baseline.test.js` 的語意 skip（`REQUIRE_BASELINE=1` 時失敗）。合成資料無法取代：< 8 幀只會得到 422。

**文件側**

4. `docs/privacy.md` 與 `docs/server-api.md` 都包含由 `ACCESS_LIMITS` 算出的字串：`${windowMs / 1000} 秒`、`${maxRequests} 次`、`maxTrackedIps.toLocaleString("en-US")`（即 `10,000`）。
5. `docs/server-api.md` 包含 `RESPONSE_HEADERS` 每一項的 `` `${key}: ${value}` ``。
6. `docs/server-api.md` 與 `docs/privacy.md` 都不含「即丟棄」（防止第 3 節的錯誤描述回來）。
7. `docs/privacy.md` 包含 `analyze failed`。
8. `README.md` 存在、包含 `APP_CONFIG.version`、包含指向 `docs/privacy.md` 與 `docs/server-api.md` 的連結。
9. `docs/server-api.md` 包含指向 `privacy.md` 的連結。

- 測試 import `lib/server/access-control.js` 與 `lib/server/http-handler.js` 取得常數（Vitest 已有 `server-only` stub alias）。
- 這些斷言刻意粗糙（字串包含），目的是「改了程式卻忘了文件」時會失敗，不是驗證文案。

### 5. 程式註解微調（只改註解）

- `lib/server/access-control.js` 檔頭第 3 行改為：「其他檔案不得自行做存取判斷。只讀標頭，不讀 body；IP 只作為記憶體 Map 的鍵（限流用），不寫入 log、不持久化。」第 4 行補「保留期間見 docs/privacy.md」。
- `lib/server/http-handler.js` 檔頭第 3 行可補「500 只 log 固定字串，不帶 error 物件」；其餘不動。
- `app/api/analyze/route.js`：現有註解已正確，不改。
- 不在 `lib/core/` 加任何註解。

### 6. `README.md` 內容

- 標題與一句話簡介（單一 Next.js 專案、單一 Vercel 部署；MediaPipe 在瀏覽器、核心演算法 server-only）。
- **版本**：`APP_CONFIG.version`（目前 `V3.29`）與 `APP_CONFIG.systemName`；註明「版本號集中於 `lib/config.js` 的 `APP_CONFIG`，發版時同步本檔」。
- **目前狀態**：Epic 0–2 完成；Client 尚未搬入（Epic 3）、尚未部署（Epic 4）。連到 `docs/planning/epics-and-features.md`。
- **開發**：Node 24.x；`npm install`、`npm run dev`、`npm run build`、`npm run lint`、`npm test`、`REQUIRE_BASELINE=1 npm test`（樣本放 `.temp/json/`，不提交）。
- **文件索引**：`docs/server-api.md`、`docs/analysis-json-contract.md`、`docs/privacy.md`、`docs/planning/epics-and-features.md`、`AGENTS.md`。
- **隱私摘要**：只上傳 landmarks（不是影片；Epic 3 起）、Server 不儲存、不寫 log（唯一例外固定字串）、IP 只在記憶體中用於限流；連到 `docs/privacy.md`。
- **存取控制摘要**：同源、無 API Key、每 IP 每 60 秒 30 次且**僅盡力而為**；連到 `docs/server-api.md#存取控制`。
- 不放部署網址、帳號或任何 secret。

## 驗收標準

1. `docs/privacy.md` 存在，涵蓋設計決策 2 的 11 個章節；每項承諾都標出對應程式位置，且與「程式實際行為盤點」一致。
2. IP 保留期間在 `docs/privacy.md` 與 `docs/server-api.md` 中依設計決策 3 如實描述；兩份文件都不再出現「即丟棄」。
3. `docs/server-api.md`「隱私」一節改為摘要並連到 `docs/privacy.md`；限流「僅盡力而為」及其原因保留且未被弱化。
4. `README.md` 存在，內容符合設計決策 6，版本與 `APP_CONFIG.version` 相同，不含部署網址或 secret。
5. 「目前狀態」誠實：文件不得宣稱 Client 已只上傳 landmarks 或已部署；以「設計目標／Epic 3 起」表述。
6. `tests/privacy-docs.test.js` 存在且通過；刻意製造不一致時會失敗（Verification 第 3 步）。
7. 程式檔（`lib/`、`app/`）的 `git diff` 只有註解行；`next.config.mjs`、`package.json` 無變更。
8. `REQUIRE_BASELINE=1 npm test` 全過，基準不變：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 經 `POST` 193／176／150。
9. `npm run build`、`npm run lint` 通過。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。**
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（含新的 `privacy-docs.test.js`）；另跑一次不帶變數的 `npm test`，確認缺樣本時 baseline 仍 skip、`privacy-docs.test.js` 不因缺樣本失敗。
3. **一致性測試的有效性（不提交）**：分別暫時做以下修改，確認 `npx vitest run tests/privacy-docs.test.js` 失敗，再還原（`git diff` 確認已還原）：
   - 在 `docs/privacy.md` 把「30 次」改成「20 次」。
   - 在 `docs/server-api.md` 加回「即丟棄」。
   - 在 `lib/server/access-control.js` 加一行 `console.log(ip)`。
   - 把 `README.md` 的版本改成 `V0.0`。
4. **dev server log 實測**：`npm run dev`，以 curl（Bash 下；PowerShell 用 `curl.exe`）送 200（`.temp/json/landmarks-woman03.json`）、400（`{}`）、403（`-H "Origin: https://evil.example"`）、帶 `X-Forwarded-For: 203.0.113.9` 的請求各一次。檢查終端機輸出：**不出現 IP、body 內容或 landmarks 數值**；記下 Next 自身印出的請求行格式，據以確認 `docs/privacy.md` 第 5 章節的描述。結束後關閉 dev server。
5. **Playwright**：載入 `http://localhost:3000/`，console 無 error、無資源 404；以 network 紀錄確認頁面**沒有對第三方網域的請求**（支持 `docs/privacy.md`「第三方資源：目前無」）。本 Feature 無互動變更，略過 `AGENTS.md` 第 4 項，於 Notes 註明。若瀏覽器被占用，比照 2.1 經使用者同意改以 curl 驗證首頁與資源。
6. **人工對照**：逐條核對 `docs/privacy.md` 的承諾與「程式實際行為盤點」表（引用的檔名、函式名、數值皆存在且正確）；`README.md` 與 `docs/` 內的相對連結都指向存在的檔案與錨點。
7. **`git diff` 檢查**：`git diff -- lib app` 只有註解行；`git diff -- next.config.mjs package.json` 為空。
8. `git status` 只有本 Feature 的檔案；`.temp/` 未提交；舊專案無變更；dev server 已關閉。

## 已知風險

- **文件描述的 Client 行為尚未實作**：「影片不離開瀏覽器、只上傳 landmarks」在 Epic 3 前無法以實際頁面驗證；3.2／3.3 規格須包含「重新核對 `docs/privacy.md`」的驗收項。
- **IP 以明文保存且保留到 instance 結束**：本 Feature 只如實記載，不改行為。低流量時過期筆幾乎不會被清理（未達 10,000 筆不觸發 `evict`）。若需要更強的承諾，另開 Feature（主動清過期、或以雜湊作鍵）。
- **一致性測試是字串比對**：只能抓到「數值或關鍵字忘了改」，無法保證敘述正確；仍需人工 review。改動文案措辭時可能需要同步調整測試。
- **平台 log 不在控制範圍**：Vercel 的 log 內容、保留期限與是否可關閉須在 4.1 查證；在此之前文件只能寫「可能記錄」。
- **Next.js 框架 log**：`next dev`／`next start` 自身的請求 log 格式可能隨版本改變；文件只描述實測結果並註明版本（16.4.6）。
- **`profileName` 可能含個人資訊**：Server 不保存，但會原樣回傳並進入匯出 JSON；是否由 Client 改為不送檔名，留給 3.3。

## 未決事項

無阻擋開工的事項。以下是本規格已採用、可於 review 時推翻的預設：

1. **新增 `README.md`**：目前不存在（2.1 規格選擇不新增）。2.2 依路線圖與使用者指示新增，內容如設計決策 6。若使用者不想要 README，改為只在 `docs/privacy.md` 與 `docs/server-api.md` 處理，並移除一致性測試第 8 項。
2. **正本分工**：隱私以 `docs/privacy.md` 為正本，限流細節以 `docs/server-api.md` 為正本，`server-api.md`「隱私」縮為摘要（設計決策 1）。
3. **新增 `tests/privacy-docs.test.js`**：屬測試、不新增依賴、不改行為；若使用者希望 2.2 純文件，可改為只做 Verification 第 6 步的人工對照。
4. **IP 保留方式不改**：明文鍵、過期不主動清除，維持 2.1 行為並如實記載；是否改為主動清理或雜湊，留待另開 Feature（建議在 Upstash 評估時一併決定）。
5. **隱私提示 UI** 留給 3.3；第三方 CDN（jsdelivr、Google Fonts）自託管與否留給 3.2。
6. **不撰寫法律性質的隱私權政策**；對外開放前是否需要，由使用者決定。
