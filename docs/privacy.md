# 隱私說明

> 這是技術性說明，描述程式實際如何處理資料，**不是法律文件**（隱私權政策、服務條款、個資告知義務不在此範圍）。每項承諾後的括號標出對應程式位置。限流細節見 [server-api.md](server-api.md#限流)。

## 1. 摘要

- 影片不離開瀏覽器：由 MediaPipe 在瀏覽器內處理（3.2 起成立，見第 2 節）。手機上以「拍攝影片」錄下的影片與選擇的檔案相同，只在瀏覽器本機播放與擷取 landmarks，不上傳；部分系統不會自動存入相簿。
- Server 只收 landmarks 等數值（33 個關節點座標、時間與少數設定），**不收影片、影像或音訊**（`/api/analyze` 的規格；3.3 起影片擷取完成時才上傳）。
- Server 不儲存請求內容；程式唯一的 log 是非預期例外時的固定字串（`analyze failed`、`derive failed`）。
- IP 只在 Server 記憶體中用於限流，不寫入 log、檔案或外部服務。
- 部署平台（Vercel）本身可能另有 log，不在本程式控制範圍。

## 2. 目前狀態

3.2 起，`/` 導向 `/index.html`，是原樣搬入的舊 Client（`next.config.mjs` `redirects()`；3.9 起檔案在 `public/` 根目錄，`public/legacy/` 當時只剩暫時核心（3.7 已移除））。它**會在瀏覽器擷取影像（MediaPipe）、每次影片擷取完成時呼叫 `/api/analyze` 與 `/api/derive`（3.3、3.7 起）、會載入第三方資源（第 8 節）、不使用瀏覽器儲存**（第 9 節）。無影片的模擬擷取（3.5 起）也會呼叫一次 `/api/analyze`（3.7 起之後另有 1 次 `/api/derive`），送出的是預先烘焙的合成 landmarks（非使用者資料）與當下的身高、機位，不送檔名；3.7 起，頁面載入、切換 profile、機位、身高、重設自動、手動步頻與 JSON 匯入都會呼叫重算端點 `/api/derive`（見第 3 節）：**匯入 JSON 時會上傳其中的 summary 數值與 cadence**（不含 `profileName`、檔名、`timestamp`），其餘情境送出的是作用中 profile 的 summary；手動步幅只影響配速，在本地計算。

3.7 起瀏覽器不再帶舊核心：評分、GCT、相位計時、步幅與骨架模型只在 Server；遙測與衍生值一律向 `/api/derive` 取得（無連線時保留上一份數值並顯示錯誤，匯入無法進行）。`lib/player/`、`lib/landmarks/`（角度擷取、擷取閘門、關鍵幀取樣、正向運動學、步幅輸入解析）與 `lib/client/`（組 derive 請求、匯入補預設值，只有欄位清單與上限、不含公式）以 `public/modules/` 的同步副本在瀏覽器執行，`lib/profiles/`（內建 profile 靜態資料、烘焙關鍵幀、合成 landmarks）也以 `public/modules/` 公開，只有輸出、沒有公式；這些是永久範圍。已知取捨：derive 可被任意 summary 反覆查詢（評分 oracle），限流僅盡力而為，不宣稱公式受保護。

3.3 起，影片擷取完成時會上傳擷取期間的**每一幀** landmarks（最多 1500 幀，最多約 3.5 MB），Client **不送 `profileName`**，所以 API 回應不含影片檔名；但匯出的 JSON 的 `profileName` 由 Client 本地寫入，仍含影片檔名（與 3.2 相同）。

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
- 無影片的模擬擷取（3.5 起）送出的 `frames[]` 是預先烘焙的合成 landmarks（`lib/profiles/sim-capture.js`），不是使用者資料；`heightCm`、`cameraMode` 取當下 UI 值，不送 `profileName`。
- `profileName` 可能含影片檔名，**請勿放入個人資訊**：它會原樣出現在回應與匯出的 JSON。

### `/api/derive`（3.6 起存在，3.7 起 Client 使用）

| 欄位 | 意義 | 是否原樣帶回 |
| ---- | ---- | ------------ |
| `summary` | 擷取後的數值摘要（角度、步幅、`phaseTiming`，只接受固定鍵） | 否 |
| `cadence` | 步頻 | 是 |
| `heightCm`、`cameraMode` | 身高、機位 | 是（含預設值） |
| `includeKeyframes` | 是否回傳 101 幀關鍵幀 | 否 |

不含 landmarks、不含檔名、不含 `profileName`；頂層與 `summary` 出現未知欄位會被拒絕（400）。body 上限 16 KB。（`lib/server/validate-derive-request.js`）

## 4. Server 如何處理

- 在記憶體中解算，回應後不再持有任何參照（`handleAnalyzeHttp`、`analyzeRequest`）。唯一的模組層級狀態是 `access-control.js` 的 IP 限流 `Map`，只存 IP 與計數，沒有請求內容。
- 不寫入檔案、資料庫或外部服務；不使用 cookie；不讀環境變數；不對外連線。
- 所有 `/api` 回應 `Cache-Control: no-store`（`RESPONSE_HEADERS`）。
- 回應只含衍生結果（`summary`、`metrics`、`phaseTiming`、101 幀 `cycleKeyframes` 等），**不回傳原始 landmarks**（`lib/server/analyze.js`）。`/api/derive` 只回 `cadence`、`heightCm`、`cameraMode` 與衍生值，不回傳 `summary`（`lib/server/derive.js`）。

## 5. 記錄（log）

- 程式唯一的 log：非預期例外（500）時 `console.error` 固定字串 `analyze failed`（`/api/analyze`）或 `derive failed`（`/api/derive`），不帶錯誤物件、stack、IP 或請求內容（`lib/server/http-handler.js`）。
- 403、429 與各種 4xx **不 log**。
- Next.js 開發伺服器（`next dev`）自身會在終端機印出請求路徑與狀態碼，這是框架行為；實測不含 body 與 IP（Next 16.4.6）。
- 舊 Client 的 `console.error`／`warn`／`info`（`public/js/analyzer.js`）只出現在使用者瀏覽器的 console，不會傳到 Server。

## 6. IP 位址與限流

- 用途只有限流（`lib/server/access-control.js` `getClientIp`、`hit`）。
- 取得方式：`x-forwarded-for` 第一段 → `x-real-ip` → 無法辨識時用共用桶 `unknown`。存取控制只讀 `sec-fetch-site`、`origin`、`host`、`x-forwarded-for`、`x-real-ip`，不讀 body、cookie 或 `Authorization`。
- IP 只以明文作為限流計數的鍵，存在單一 serverless instance 的記憶體中，不寫入 log、檔案或任何外部服務，不與其他資料關聯，不回傳給 client。視窗（60 秒）過期後計數不再生效，但該筆紀錄要等到同一 IP 再次請求、追蹤筆數達 10,000 筆觸發清理，或 instance 被回收時才會從記憶體移除；因此最長可能保留到該 instance 結束為止。instance 的存活時間由平台決定。
- 目前參數：每 IP 每 60 秒 30 次（`/api/analyze` 與 `/api/derive` 共用同一個計數；3.7 起各操作消耗：頁面載入 1、切換未算過的 profile 1、機位／身高／重設自動各 1、手動步頻 debounce 後 1、影片或模擬擷取 analyze 1＋derive 1、匯入 2）、最多追蹤 10,000 個 IP（`ACCESS_LIMITS`）。
- 限流**僅盡力而為**，原因與限制見 [server-api.md](server-api.md#限流)。

## 7. 部署平台

部署在 Vercel 時，平台可能記錄請求 metadata（時間、路徑、狀態碼、IP、User-Agent 等），依 Vercel 的隱私政策與方案保留。本程式無法控制；範圍與保留期依 Vercel 方案，見 [deployment.md](deployment.md) 第 7 節（以官方說明為準）。本專案未啟用 Vercel Web Analytics、Speed Insights。

## 8. 第三方資源

3.2 起，舊 Client（`public/index.html`）會讓瀏覽器直接連到：

- `cdn.tailwindcss.com`（Tailwind Play CDN）
- `fonts.googleapis.com`、`fonts.gstatic.com`（Inter、JetBrains Mono、Noto Sans TC）
- `cdn.jsdelivr.net`（`@mediapipe/{camera_utils,control_utils,drawing_utils,pose}` 的 script，以及選影片後由 `locateFile` 抓取的 wasm、`.data`、`.binarypb` 與 heavy 模型）

對方可見使用者的 IP、User-Agent 與本站 origin（頁面未設 `Referrer-Policy`，瀏覽器預設 `strict-origin-when-cross-origin`）。**影片與 landmarks 不會送往這些第三方**：MediaPipe 在本機執行，CDN 只提供程式與模型檔。這些資源**未釘版本**，上游變動會直接改變行為。自託管或釘版另開 Feature 處理，4.1 部署時仍未釘版（是否在那之前公開部署由使用者決定）。

## 9. Cookie 與瀏覽器儲存

舊 Client 不使用 cookie、localStorage、sessionStorage、IndexedDB，也沒有追蹤或分析工具（`tests/legacy-client.test.js` 檢查 `public/` 不含這些字樣；只檢查本站檔案，第三方 CDN script 的行為不在此保證）。影片以 `blob:` URL 在記憶體播放（`URL.createObjectURL`）、JSON 匯入用 `FileReader` 在本機讀取、匯出為本機下載，皆不離開瀏覽器。3.8 起的「匯出報告」只在本機組出報告頁並用瀏覽器列印／另存 PDF，**不發任何網路請求**；報告標題預設為影片檔名（可在報告內改成暱稱），檔名只出現在本機畫面與 PDF 中，不上傳。

## 10. 日後可能改變的情況

下列變更時必須同步更新本文件：

- 限流改用外部儲存（Upstash Redis，IP 會存到第三方）
- 加入 Turnstile 或登入
- 新增其他端點（重算端點 `/api/derive` 已於 3.6 建立）
- 頁面 CSP、第三方資源釘版或自託管
- 部署（4.1）

## 11. 文件與程式的一致性

`tests/privacy-docs.test.js` 檢查：`app/`、`lib/` 只有一處固定字串 log；不讀 env、不寫檔、不對外連線、不使用 cookie 或瀏覽器儲存；回應不含原始 landmarks；本文件與 `server-api.md` 的限流數值和安全標頭與程式一致；README 版本與 `APP_CONFIG.version` 相同。`tests/legacy-client.test.js` 檢查：`public/legacy/` 與暫時核心不存在、`app/`／`lib/` 不引用它、`next.config.mjs` 無部署防線、`public/**` 不含核心特有字串、舊 Client 不使用瀏覽器儲存與其他外送通道、`fetch` 恰好兩處（`js/analyzer.js` 的 `/api/analyze`、`js/derive.js` 的 `/api/derive`，皆相對路徑）、上傳請求不含 `profileName`、`phaseTiming` 只在匯入時寫回、上傳幀數上限不超過 `LIMITS`。這些檢查是字串比對，只能抓到「改了程式忘了文件」，不保證敘述正確。

`tests/browser-modules.test.js` 檢查：`lib/player/`、`lib/landmarks/` 不含 server-only 相依與核心特有字串、只用同目錄相對 import，且與 `public/modules/` 的同步副本內容一致。
