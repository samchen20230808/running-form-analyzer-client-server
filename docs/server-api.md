# Server API（`POST /api/analyze`）

> ⚠️ **存取控制（Origin／`Sec-Fetch-Site`、限流、其餘安全標頭）尚未實作，見路線圖 Epic 2；目前不可對外部署。** Client 也尚未呼叫此 API（Epic 3）。

輸入影片擷取期間的 MediaPipe landmarks，輸出符合 [分析結果 JSON 契約 v1.0.0](analysis-json-contract.md) 的結果（含 `summary`、`metrics`、101 幀 `cycleKeyframes`）。

## 架構

- `app/api/analyze/route.js`：只 export `runtime = "nodejs"` 與 `POST`，轉呼叫 `lib/server/http-handler.js` 的 `handleAnalyzeHttp`。
- `lib/server/http-handler.js`：框架無關的 HTTP 流程（只用標準 `Request`／`Response`）。
- `lib/server/access-control.js`：存取控制**單一接入點**（`checkAccess`），目前為放行 stub；Epic 2 只替換此模組。
- `lib/server/analyze.js`、`validate-request.js`：主流程與請求驗證（Feature 1.2）。以上皆為 `server-only`，不會進入瀏覽器 bundle。

## 處理順序

存取控制（只看標頭，不讀 body）→ Content-Type 415 → 串流讀 body 並檢查上限 413 → JSON 解析 400 → 驗證與解算（400／413／422／200）。

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

200：契約 v1.0.0，`source: "server"`。所有回應帶 `Cache-Control: no-store`，**不帶任何 CORS 標頭**。

| 狀態 | 內容 | 時機 |
| ---- | ---- | ---- |
| 400 | `{ error: "invalid_request", details: [...] }` | 缺必填、`lm` 不是 33 點、非有限數字、超出範圍、body 非 JSON（含空 body） |
| 405 | — | 非 POST（Next 自動回應，同樣帶 `no-store`；`OPTIONS` 回 204 與 `Allow`） |
| 413 | `{ error: "payload_too_large" }` | `frames` 超過 3000，或 body 超過 4 MB（邊讀邊計數，超過即中止；不只信 `Content-Length`） |
| 415 | `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }` | Content-Type 不符 |
| 422 | `{ error: "insufficient_frames", acceptedFrames }` | 閘門收到的有效幀 < 8 |
| 500 | `{ error: "internal_error" }` | 非預期例外；不回傳 stack 或訊息 |
| 413（平台） | 由 Vercel 直接回應，不經本 API，格式不同 | body 超過平台上限約 4.5 MB；部署後（4.1）實測 |

與舊 Server 的刻意差異：Content-Type 改為嚴格比對 media type，以擋下不需 preflight 的跨站 simple request。其餘狀態碼與 body 與舊 Server 逐項相同（已用 13 個案例對照）。

## 隱私

- 上傳的是 landmarks（33 點正規化座標與時間），不是影片。
- 不儲存、不記錄請求內容；唯一的 log 是 500 時的固定字串 `analyze failed`。
- 部署平台本身可能記錄請求 metadata，依其隱私政策。
