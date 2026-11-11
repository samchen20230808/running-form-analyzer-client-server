# 隱私說明

> 這是技術性說明，描述程式實際如何處理資料，**不是法律文件**（隱私權政策、服務條款、個資告知義務不在此範圍）。每項承諾後的括號標出對應程式位置。限流細節見 [server-api.md](server-api.md#限流)。

## 1. 摘要

- 影片不離開瀏覽器：由 MediaPipe 在瀏覽器內處理（**設計目標，Epic 3 起**，見第 2 節）。
- Server 只收 landmarks 等數值（33 個關節點座標、時間與少數設定），**不收影片、影像或音訊**。
- Server 不儲存請求內容；程式唯一的 log 是非預期例外時的固定字串 `analyze failed`。
- IP 只在 Server 記憶體中用於限流，不寫入 log、檔案或外部服務。
- 部署平台（Vercel）本身可能另有 log，不在本程式控制範圍。

## 2. 目前狀態

Client 尚未搬入（Epic 3）。目前頁面（`/`）只是佔位頁，**不擷取影像、不呼叫 API、不載入第三方資源、不使用 localStorage**（`app/page.js`、`app/layout.js`）。

本文件中關於 Client 的描述（影片在瀏覽器內處理、只上傳 landmarks）是設計目標；3.2、3.3 完成時必須重新核對本文件。

## 3. 上傳的資料

| 欄位 | 意義 | 是否原樣帶回 |
| ---- | ---- | ------------ |
| `frameWidth`、`frameHeight` | 擷取畫面尺寸 | 否（用於解算） |
| `heightCm` | 使用者輸入的身高 | 是 |
| `cameraMode`、`runDirection`、`isManualDirection` | 擷取設定 | `cameraMode` 是 |
| `profileName`（選填，≤ 200 字） | 設定檔名稱 | 有提供時是 |
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

## 6. IP 位址與限流

- 用途只有限流（`lib/server/access-control.js` `getClientIp`、`hit`）。
- 取得方式：`x-forwarded-for` 第一段 → `x-real-ip` → 無法辨識時用共用桶 `unknown`。存取控制只讀 `sec-fetch-site`、`origin`、`host`、`x-forwarded-for`、`x-real-ip`，不讀 body、cookie 或 `Authorization`。
- IP 只以明文作為限流計數的鍵，存在單一 serverless instance 的記憶體中，不寫入 log、檔案或任何外部服務，不與其他資料關聯，不回傳給 client。視窗（60 秒）過期後計數不再生效，但該筆紀錄要等到同一 IP 再次請求、追蹤筆數達 10,000 筆觸發清理，或 instance 被回收時才會從記憶體移除；因此最長可能保留到該 instance 結束為止。instance 的存活時間由平台決定。
- 目前參數：每 IP 每 60 秒 30 次、最多追蹤 10,000 個 IP（`ACCESS_LIMITS`）。
- 限流**僅盡力而為**，原因與限制見 [server-api.md](server-api.md#限流)。

## 7. 部署平台

部署在 Vercel 時，平台可能記錄請求 metadata（時間、路徑、狀態碼、IP、User-Agent 等），依 Vercel 的隱私政策與方案保留。本程式無法控制；4.1 部署後補上查證結果。

## 8. 第三方資源

目前無。舊專案的 Client 由 `cdn.jsdelivr.net` 載入 MediaPipe、由 Google Fonts 載入字型；若 3.2 沿用，瀏覽器會直接連到這些第三方（對方可見 IP 與 User-Agent），屆時須更新本節或改為自託管。

## 9. Cookie 與瀏覽器儲存

目前不使用 cookie、localStorage、sessionStorage、IndexedDB，也沒有追蹤或分析工具。

## 10. 日後可能改變的情況

下列變更時必須同步更新本文件：

- 限流改用外部儲存（Upstash Redis，IP 會存到第三方）
- 加入 Turnstile 或登入
- Client 搬入（3.2）、Client 開始上傳（3.3）
- 部署（4.1）

## 11. 文件與程式的一致性

`tests/privacy-docs.test.js` 檢查：`app/`、`lib/` 只有一處固定字串 log；不讀 env、不寫檔、不對外連線、不使用 cookie 或瀏覽器儲存；回應不含原始 landmarks；本文件與 `server-api.md` 的限流數值和安全標頭與程式一致；README 版本與 `APP_CONFIG.version` 相同。這些檢查是字串比對，只能抓到「改了程式忘了文件」，不保證敘述正確。
