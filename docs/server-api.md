# Server API（`POST /api/analyze`、`POST /api/derive`）

> ⚠️ 存取控制採同源模型（方案 A）。**限流為每個 serverless instance 的記憶體計數，僅盡力而為，不是嚴格配額。** 3.3 起舊 Client 在影片擷取完成時呼叫 `/api/analyze`（不送 `profileName`）；3.6 起提供 `/api/derive`，3.7 起 Client 在頁面載入、切換 profile、機位、身高、重設自動、手動步頻（debounce 400 ms）、擷取完成（1 次）與匯入（2 次）時呼叫，回應的 `phaseTiming` 只在匯入時被 Client 採用；部署見 4.1。

輸入影片擷取期間的 MediaPipe landmarks，輸出符合 [分析結果 JSON 契約 v1.1.0](analysis-json-contract.md) 的結果（含 `summary`、`metrics`、101 幀 `cycleKeyframes`）。

## 架構

- `app/api/analyze/route.js`：只 export `runtime = "nodejs"` 與 `POST`，轉呼叫 `lib/server/http-handler.js` 的 `handleAnalyzeHttp`。
- `app/api/derive/route.js`：同上，轉呼叫 `handleDeriveHttp`。
- `lib/server/http-handler.js`：框架無關的 HTTP 流程（只用標準 `Request`／`Response`），兩個端點共用 `handleJsonPost`。
- `lib/server/access-control.js`：存取控制**單一接入點**（`checkAccess`），實作 Origin／`Sec-Fetch-Site` 檢查與每 IP 限流（常數 `ACCESS_LIMITS`）；日後升級（Turnstile、登入）只替換此模組。
- `lib/server/analyze.js`、`validate-request.js`：主流程與請求驗證（Feature 1.2）。`metrics.js`（`buildMetrics`，兩端點共用）、`derive.js`、`validate-derive-request.js`：衍生值端點（3.6）。以上皆為 `server-only`，不會進入瀏覽器 bundle。

## 處理順序

存取控制（Origin 403 → 限流 429，只看標頭、不讀 body）→ Content-Type 415 → 串流讀 body 並檢查上限 413 → JSON 解析 400 → 驗證與解算（400／413／422／200）。

## 存取控制

### Origin／`Sec-Fetch-Site` 規則（依序，第一條命中即決定）

| # | 條件 | 結果 |
| - | ---- | ---- |
| 1 | `Sec-Fetch-Site: same-origin` | 放行 |
| 2 | `Sec-Fetch-Site: none` | 放行 |
| 3 | `Sec-Fetch-Site` 為其他任何值（含 `same-site`、`cross-site`、空值） | 403 |
| 4 | 無 `Sec-Fetch-Site`、有 `Origin`：http(s) 且 host 等於 `Host`（無則 `request.url`） | 放行 |
| 4b | 同上但 `null`、無法解析、非 http(s)、host 不符 | 403 |
| 5 | 兩者皆無 | 放行 |

無這兩個標頭的非瀏覽器請求（curl、腳本）會被放行，只受限流約束；**這不是身分驗證**。此檢查只擋瀏覽器端的跨站濫用。只比 host、不比協定（Vercel 在邊緣終結 TLS）。

### 限流

- 每 IP 每 60 秒 30 次（`/api/analyze` 與 `/api/derive` **共用同一個計數**），固定視窗；超過回 429＋`Retry-After`（秒，整數，≥ 1）。通過 Origin 檢查的請求一律計數（不論之後是 200 或 4xx）；被 403 拒絕的不計數。
- IP 取自 `x-forwarded-for` 第一段 → `x-real-ip` → 共用桶 `unknown`。**只在 Vercel 為最外層時可信**（Vercel 會覆寫這兩個標頭，部署後於 4.1 實測）；本地 `next dev`／`next start` 的 XFF 可偽造，**不要把 `next start` 直接暴露在網路上**。
- **僅盡力而為**，原因：計數只在單一 instance 記憶體中；Vercel 會依流量同時執行多個 instance（實際上限可能是 30 × instance 數）；冷啟動或 instance 回收會歸零；同一 NAT 後的使用者共用額度；最多追蹤 10,000 個 IP，滿時最早開窗的計數會被擠掉；IPv6 使用者可輕易換位址。需要嚴格限流時改用外部儲存（路線圖待處理：Upstash Redis）。

## 請求

`Content-Type: application/json`（只比對 media type 本體，`application/json; charset=utf-8` 可；`text/plain; x=application/json` 不可）。

```jsonc
{
  "frameWidth": 640,          // 必填；= videoCanvas.width
  "frameHeight": 360,         // 必填；= videoCanvas.height
  "heightCm": 172,            // 選填，預設 172
  "cameraMode": "auto",       // 選填："auto" | "static" | "tracking"，預設 "auto"
  "runDirection": 1,          // 選填：1 | -1，預設 1
  "isManualDirection": false, // 選填，預設 false
  "profileName": "…",         // 選填；有才原樣帶回
  "frames": [                 // 必填；擷取期間每一次 onPoseResults 的 sanitized landmarks
    { "t": 0.4521, "lm": [[0.51, 0.22, 0.99], "…共 33 點 [x, y, visibility]"] }
  ]
}
```

- 數值範圍：`frameWidth`／`frameHeight` 0 ~ 16384；`heightCm` 50 ~ 250；`t` 0 ~ 86400；`x`／`y` -5 ~ 5；`visibility` 0 ~ 1 或 `null`；`profileName` ≤ 200 字。
- 要送擷取期間的**每一幀**：方向偵測與擷取閘門由 Server 重跑。

## 回應

200：契約 v1.1.0（`metrics.gct` 為 `computeGctMetrics` 完整物件，見契約文件），`source: "server"`。所有回應（含 4xx／5xx，以及 Next 自動回的 405／`OPTIONS`）帶下列安全標頭，**不帶任何 CORS 標頭**：`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`。

| 狀態 | 內容 | 時機 |
| ---- | ---- | ---- |
| 400 | `{ error: "invalid_request", details: [...] }` | 缺必填、`lm` 不是 33 點、非有限數字、超出範圍、body 非 JSON（含空 body） |
| 403 | `{ error: "forbidden" }` | 瀏覽器跨源請求（見上方規則） |
| 405 | — | 非 POST（Next 自動回應，同樣帶 `no-store`；`OPTIONS` 回 204 與 `Allow`） |
| 413 | `{ error: "payload_too_large" }` | `frames` 超過 3000，或 body 超過 4 MB（邊讀邊計數，超過即中止；不只信 `Content-Length`） |
| 415 | `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }` | Content-Type 不符 |
| 422 | `{ error: "insufficient_frames", acceptedFrames }` | 閘門收到的有效幀 < 8 |
| 429 | `{ error: "rate_limited" }`＋`Retry-After` 標頭 | 超過每 IP 限流 |
| 500 | `{ error: "internal_error" }` | 非預期例外；不回傳 stack 或訊息 |
| 413（平台） | 由 Vercel 直接回應，不經本 API，格式不同 | body 超過平台上限約 4.5 MB；部署後（4.1）實測 |

與舊 Server 的刻意差異：Content-Type 改為嚴格比對 media type，以擋下不需 preflight 的跨站 simple request。其餘狀態碼與 body 與舊 Server 逐項相同（已用 13 個案例對照）。2.1 起另有：沒有 API Key／401／503；429 body 不含 `retryAfterSec`（改看 `Retry-After`）；新增 Origin 檢查 403。

## `POST /api/derive`（3.6 起）

由 `summary`＋`cadence` 重算衍生值，不含 landmarks。`Content-Type: application/json`，body 上限 **16 KB**，處理順序與存取控制同上。

```jsonc
{
  "summary": { "trunkAngle": 9.8, "avgElbow": 125, "hipRomDeg": 62, "strideMeters": 0.36, "phaseTiming": { "touchPct": 0, "posePct": 15, "fallPct": 30, "pullPct": 84 } },
  "cadence": 103,            // 必填，0 < cadence ≤ 400
  "heightCm": 172,           // 選填，50 ~ 250，預設 172
  "cameraMode": "auto",      // 選填
  "includeKeyframes": false  // 選填；true 才回傳 101 幀 cycleKeyframes
}
```

- 驗證：`cadence` 必填且為 0 ~ 400 的正數；`heightCm` 50 ~ 250；`cameraMode` 為 `auto`｜`static`｜`tracking`；`includeKeyframes` 為 boolean；這些選填欄位給 `null` 不合法（只有 `summary` 內的欄位接受 `null`）。`summary` 數值欄位為有限數字（絕對值 ≤ 1000）或 `null`，`phaseTiming` 各欄 0 ~ 100 或 `null`，`summary` 與 `phaseTiming` 不可為陣列。
- `summary` 只接受 `trunkAngle`、`comOffsetCm`、`touchdownKnee`、`minSwingKnee`、`pushOffExtensionDeg`、`avgElbow`、`footStrikeAngle`、`hipRomDeg`、`strideMeters`、`_measuredPixelStride`、`measuredStrideMeters`（有限數字或 `null`）、`_autoDetectedStatic`、`phaseTiming`；頂層或 `summary` 的未知欄位回 400。
- 200 回應：`schemaVersion`、`version`、`source`、`cadence`、`heightCm`、`cameraMode`、`metrics`（含 `gct`）、`phaseTiming`、`stride`（`strideMeters`、`measuredStrideMeters`、`pixelVal`、`strideModeText`）、`autoStrideMeters`，選擇性 `cycleKeyframes`。無 `timestamp`，不回傳 `summary`。
- `phaseTiming` 的正規化不冪等：只應在匯入時採用，不可寫回 summary 後再送。
- 錯誤碼：400、403、405、413、415、429、500；**沒有 422**。500 只 log 固定字串 `derive failed`。
- 此端點不需 MediaPipe，可反覆查詢評分與步幅公式（評分 oracle 風險），限流僅盡力而為。

## 隱私

完整說明見 [privacy.md](privacy.md)。摘要：

- 上傳的是 landmarks（33 點正規化座標與時間），不是影片。
- 不儲存、不記錄請求內容；唯一的 log 是 500 時的固定字串（`analyze failed`、`derive failed`）。
- IP 只以明文作為記憶體中限流計數的鍵，不寫入 log、不持久化。視窗（60 秒）過期後計數不再生效，但該筆紀錄要等到同一 IP 再次請求、追蹤筆數達 10,000 筆觸發清理，或 instance 被回收時才會移除，因此最長可能保留到該 instance 結束為止。
- 部署平台本身可能記錄請求 metadata，依其隱私政策。
