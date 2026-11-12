# 隱私說明

> 這是技術性說明，描述程式實際如何處理資料，**不是法律文件**（隱私權政策、服務條款、個資告知義務不在此範圍）。每項承諾後的括號標出對應程式位置。限流細節見 [server-api.md](server-api.md#限流)。

## 1. 摘要

- 影片不離開瀏覽器：由 MediaPipe 在瀏覽器內處理（3.2 起成立，見第 2 節）。
- Server 只收 landmarks 等數值（33 個關節點座標、時間與少數設定），**不收影片、影像或音訊**（`/api/analyze` 的規格；3.3 起影片擷取完成時才上傳）。
- Server 不儲存請求內容；程式唯一的 log 是非預期例外時的固定字串 `analyze failed`。
- IP 只在 Server 記憶體中用於限流，不寫入 log、檔案或外部服務。
- 部署平台（Vercel）本身可能另有 log，不在本程式控制範圍。

## 2. 目前狀態

3.2 起，`/` 導向 `/index.html`，是原樣搬入的舊 Client（`next.config.mjs` `redirects()`；3.9 起檔案在 `public/` 根目錄，`public/legacy/` 只剩 temp-core）。它**會在瀏覽器擷取影像（MediaPipe）、每次影片擷取完成時呼叫一次 `/api/analyze`（3.3 起）、會載入第三方資源（第 8 節）、不使用瀏覽器儲存**（第 9 節）。無影片的模擬擷取、JSON 匯入、手動調整步幅／身高／步頻與遙測**仍在瀏覽器本地**計算，不呼叫 API。

**過渡期（3.2 完成至 3.7 完成）**：舊 Client 連同舊核心的暫時副本（`public/legacy/temp-core/`）一起在瀏覽器執行，遙測、衍生值與手動重算在本機完成（即時角度與擷取閘門仍在本地，影片擷取的最終分析由 Server 重跑）；這個版本**不可部署**（`next.config.mjs` 在 `VERCEL` 環境會讓 build 失敗），因為 `public/` 下的檔案部署後就是公開 URL。防線依賴 Vercel build 時存在 `VERCEL` 環境變數（4.1 前須實測確認）；日後若 `vercel env pull` 把 `VERCEL` 寫進 `.env.local`，本地 `dev`／`build` 也會被擋，屆時自行移除該行。3.4 起，`lib/player/`、`lib/landmarks/`（角度擷取、擷取閘門、關鍵幀取樣、正向運動學、步幅輸入解析）以 `public/modules/` 的同步副本在瀏覽器執行，這是永久範圍，不是過渡期，且沒有新的資料流。「核心只在 Server」要到 3.7 移除暫時核心後才成立。

3.3 起，影片擷取完成時會上傳擷取期間的**每一幀** landmarks（最多 1500 幀，最多約 3.5 MB），Client **不送 `profileName`**，所以 API 回應不含影片檔名；但匯出的 JSON 的 `profileName` 由 Client 本地寫入，仍含影片檔名（與 3.2 相同）。3.7 完成時須再核對本文件。

## 3. 上傳的資料

| 欄位 | 意義 | 是否原樣帶回 |
| ---- | ---- | ------------ |
| `frameWidth`、`frameHeight` | 擷取畫面尺寸 | 否（用於解算） |
| `heightCm` | 使用者輸入的身高 | 是 |
| `cameraMode`、`runDirection`、`isManualDirection` | 擷取設定 | `cameraMode` 是 |
| `profileName`（選填，≤ 200 字） | 設定檔名稱（3.3 起舊 Client 不送） | 有提供時是 |
| `frames[]` | 每幀 `t` 與 `lm`（33 點 `[x, y, visibility]`） | 否 |

（`lib/server/validate-request.js`、[server-api.md](server-api.md#請求)）

- `heightCm`、`cameraMode` 未提供時，帶回的是預設值（172、`"auto"`）。
- landmarks 是 33 個關節點的正規化座標與可見度，**不是影像**，但仍是可描述身體動作的資料。
- `profileName` 可能含影片檔名，**請勿放入個人資訊**：它會原樣出現在回應與匯出的 JSON。

## 4. Server 如何處理

- 在記憶體中解算，回應後不再持有任何參照（`handleAnalyzeHttp`、`analyzeRequest`）。唯一的模組層級狀態是 `access-control.js` 的 IP 限流 `Map`，只存 IP 與計數，沒有請求內容。
- 不寫入檔案、資料庫或外部服務；不使用 cookie；不讀環境變數；不對外連線。
- 所有 `/api` 回應 `Cache-Control: no-store`（`RESPONSE_HEADERS`）。
- 回應只含衍生結果（`summary`、`metrics`、`phaseTiming`、101 幀 `cycleKeyframes` 等），**不回傳原始 landmarks**（`lib/server/analyze.js`）。

## 5. 記錄（log）

- 程式唯一的 log：非預期例外（500）時 `console.error("analyze failed")`，固定字串，不帶錯誤物件、stack、IP 或請求內容（`lib/server/http-handler.js`）。
- 403、429 與各種 4xx **不 log**。
- Next.js 開發伺服器（`next dev`）自身會在終端機印出請求路徑與狀態碼，這是框架行為；實測不含 body 與 IP（Next 16.4.6）。
- 舊 Client 的 `console.error`／`warn`／`info`（`public/js/analyzer.js`）只出現在使用者瀏覽器的 console，不會傳到 Server。

## 6. IP 位址與限流

- 用途只有限流（`lib/server/access-control.js` `getClientIp`、`hit`）。
- 取得方式：`x-forwarded-for` 第一段 → `x-real-ip` → 無法辨識時用共用桶 `unknown`。存取控制只讀 `sec-fetch-site`、`origin`、`host`、`x-forwarded-for`、`x-real-ip`，不讀 body、cookie 或 `Authorization`。
- IP 只以明文作為限流計數的鍵，存在單一 serverless instance 的記憶體中，不寫入 log、檔案或任何外部服務，不與其他資料關聯，不回傳給 client。視窗（60 秒）過期後計數不再生效，但該筆紀錄要等到同一 IP 再次請求、追蹤筆數達 10,000 筆觸發清理，或 instance 被回收時才會從記憶體移除；因此最長可能保留到該 instance 結束為止。instance 的存活時間由平台決定。
- 目前參數：每 IP 每 60 秒 30 次、最多追蹤 10,000 個 IP（`ACCESS_LIMITS`）。
- 限流**僅盡力而為**，原因與限制見 [server-api.md](server-api.md#限流)。

## 7. 部署平台

部署在 Vercel 時，平台可能記錄請求 metadata（時間、路徑、狀態碼、IP、User-Agent 等），依 Vercel 的隱私政策與方案保留。本程式無法控制；4.1 部署後補上查證結果。

## 8. 第三方資源

3.2 起，舊 Client（`public/index.html`）會讓瀏覽器直接連到：

- `cdn.tailwindcss.com`（Tailwind Play CDN）
- `fonts.googleapis.com`、`fonts.gstatic.com`（Inter、JetBrains Mono、Noto Sans TC）
- `cdn.jsdelivr.net`（`@mediapipe/{camera_utils,control_utils,drawing_utils,pose}` 的 script，以及選影片後由 `locateFile` 抓取的 wasm、`.data`、`.binarypb` 與 heavy 模型）

對方可見使用者的 IP、User-Agent 與本站 origin（頁面未設 `Referrer-Policy`，瀏覽器預設 `strict-origin-when-cross-origin`）。**影片與 landmarks 不會送往這些第三方**：MediaPipe 在本機執行，CDN 只提供程式與模型檔。這些資源**未釘版本**，上游變動會直接改變行為。自託管或釘版留待 4.1 前處理。

## 9. Cookie 與瀏覽器儲存

舊 Client 不使用 cookie、localStorage、sessionStorage、IndexedDB，也沒有追蹤或分析工具（`tests/legacy-client.test.js` 檢查 `public/` 不含這些字樣；只檢查本站檔案，第三方 CDN script 的行為不在此保證）。影片以 `blob:` URL 在記憶體播放（`URL.createObjectURL`）、JSON 匯入用 `FileReader` 在本機讀取、匯出為本機下載，皆不離開瀏覽器。

## 10. 日後可能改變的情況

下列變更時必須同步更新本文件：

- 限流改用外部儲存（Upstash Redis，IP 會存到第三方）
- 加入 Turnstile 或登入
- 新增重算端點（`docs/client-server-boundary.md` D6）
- 頁面 CSP、第三方資源釘版或自託管
- 部署（4.1）

## 11. 文件與程式的一致性

`tests/privacy-docs.test.js` 檢查：`app/`、`lib/` 只有一處固定字串 log；不讀 env、不寫檔、不對外連線、不使用 cookie 或瀏覽器儲存；回應不含原始 landmarks；本文件與 `server-api.md` 的限流數值和安全標頭與程式一致；README 版本與 `APP_CONFIG.version` 相同。`tests/legacy-client.test.js` 檢查：暫時核心只在 `public/legacy/temp-core/` 且帶 `TEMP-CORE` 標示、`app/`／`lib/` 不引用它、舊 Client 不使用瀏覽器儲存與其他外送通道、`fetch` 只有一處（`js/analyzer.js` 的相對路徑 `/api/analyze`）、上傳請求不含 `profileName`、上傳幀數上限不超過 `LIMITS`、`VERCEL` 環境的部署防線。`next.config.mjs` 在 build 時讀 `VERCEL` 作為部署防線，不屬 Server 執行期。這些檢查是字串比對，只能抓到「改了程式忘了文件」，不保證敘述正確。

`tests/browser-modules.test.js` 檢查：`lib/player/`、`lib/landmarks/` 不含 server-only 相依與核心特有字串、只用同目錄相對 import，且與 `public/modules/` 的同步副本內容一致。
