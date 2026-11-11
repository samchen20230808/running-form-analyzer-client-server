# Feature 1.3 — Route Handler `/api/analyze`

## Status

`planned`

## Epic

Epic 1 — 核心演算法 ESM 化（server-only）

## Objective

新增 `app/api/analyze/route.js`（`POST`、Node runtime），把 1.2 的 `analyzeRequest` 接上 HTTP：

- 以串流讀取 body，並以 `LIMITS.maxBodyBytes`（4 MB）強制上限（不能只看 `Content-Length`）。
- 把 Content-Type、body 過大、JSON 解析失敗與 `analyzeRequest` 的三種錯誤類型對應成 400／413／415／422。非預期例外一律回 500 `internal_error`，不回傳 stack。
- 所有回應帶 `Cache-Control: no-store`，非 POST 回 405。
- 對應後的 HTTP 回應（狀態碼與 body）與舊 Server **完全相同**（`timestamp` 除外；存取控制相關的 401／429／503 不在本 Feature）。

存取控制（Origin／`Sec-Fetch-Site`、限流、其餘安全標頭）屬 Epic 2，本 Feature **不實作**，但要預留**單一接入點**（第 4 節），讓 2.1 只需替換一個模組。

**計算行為零變更**：本 Feature 不修改 `lib/core/`、`lib/server/analyze.js`、`lib/server/validate-request.js`、`lib/contract/`。

## Next.js 16.4.6 文件查證（`node_modules/next/dist/docs/`）

本專案的 Next.js 有破壞性變更，下列 API 細節已對照本機文件確認，實作時以此為準：

| 主題 | 文件 | 結論 |
| ---- | ---- | ---- |
| 檔案位置 | `01-app/01-getting-started/15-route-handlers.md` | `app/api/analyze/route.js`；同一路由層級不可同時有 `page.js`（`app/page.js` 與 `app/api/analyze/route.js` 不衝突） |
| 方法 | `01-app/03-api-reference/03-file-conventions/route.md` | 以具名 export 定義（`export async function POST(request)`）；未定義的方法由 Next 自動回 **405 Method Not Allowed**；未定義 `OPTIONS` 時 Next 會自動實作並依已定義方法設定 `Allow` 標頭 |
| `request` 參數 | 同上 | 執行時是 `NextRequest`（Web `Request` 的延伸）。**本專案只使用標準 `Request` API**（`headers`、`body`），不用 `nextUrl`／`cookies`，以便 Vitest 直接傳入 `new Request(...)` |
| Body 讀取 | 同上「Request Body」 | 使用標準 Web API；App Router 沒有 Pages Router 的 `bodyParser`／`sizeLimit` 設定，**框架不會替我們限制 body 大小**，上限必須自己實作 |
| 快取 | `15-route-handlers.md`「Caching」 | Route Handler 預設不快取；只有 `GET` 能選擇快取，`POST` **不會被快取**。因此**不需要** `export const dynamic = "force-dynamic"`（舊專案有，本專案不加） |
| `runtime` | `03-file-conventions/02-route-segment-config/runtime.md` | `export const runtime = "nodejs"`（預設值，明列以示意圖）；`'edge'` 已 deprecated。**若日後啟用 Cache Components（`cacheComponents`），必須移除 `runtime` export**（含 `"nodejs"`），本專案目前未啟用 |
| Segment config | `02-route-segment-config/index.md` | 16.x 表列 `dynamicParams`、`runtime`、`preferredRegion`（deprecated）、`maxDuration`；`dynamic`／`revalidate`／`fetchCache` 在 Cache Components 下已移除。本 Feature 只 export `runtime` |
| `next.config.js` `headers()` | `05-config/01-next-config-js/headers.md` | 可對非 immutable 資源設定 `Cache-Control`；用來讓 Next **自動產生的 405／OPTIONS 回應**也帶 `no-store`（見第 6 節） |
| `proxy`（原 middleware） | `05-config/01-next-config-js/proxyClientMaxBodySize.md` | 使用 `proxy.js` 時 Next 會緩衝 body，預設上限 10 MB，**超過時只截斷、不報錯**。本 Feature 不新增 `proxy.js`；Epic 2 若改用 proxy，須注意此行為（見「風險」） |

## 舊專案現況（唯讀盤點結果）

| 舊檔 | 內容 | 本 Feature 處理 |
| ---- | ---- | ---- |
| `server/app/api/analyze/route.js` | `runtime = "nodejs"`、`dynamic = "force-dynamic"`；模組層級讀存取設定、建立 limiter；`POST` 轉呼叫 `handleAnalyzeHttp` | 照結構搬：route 只轉呼叫；不加 `dynamic`；不讀環境變數、不建 limiter |
| `server/lib/http-handler.js` | 框架無關的 HTTP 流程：設定檢查 503 → 認證 401 → 限流 429 → Content-Type 415 → 讀 body 413 → JSON 400 → 解算；`readLimitedText` 邊讀邊計數；`try/catch` 轉 500 `internal_error`，只 log `"analyze failed"`；`SECURITY_HEADERS` 5 個 | 搬成 `lib/server/http-handler.js`；去掉 503／401／429（改為存取控制接入點）；`SECURITY_HEADERS` 本 Feature 只保留 `Cache-Control`（見待決定事項 3） |
| `server/lib/auth.js`、`access-config.js`、`rate-limit.js` | API Key 認證、環境變數、記憶體限流 | **不搬**（本專案採方案 A；限流在 2.1 重寫） |
| `server/next.config.mjs` | `headers()` 對 `/api/:path*` 設 5 個安全標頭（讓 Next 自動回的 405 也帶標頭）；`outputFileTracingIncludes`（vm 讀檔用） | 只搬 `headers()`，本 Feature 只放 `Cache-Control`；`outputFileTracing*` 不需要（核心是 import，會被自動追蹤） |
| `docs/server-api.md` | 請求、回應、狀態碼表、處理順序、隱私、部署 | 本專案新建 `docs/server-api.md`，只寫本 Feature 已實作的部分（第 9 節） |

舊 `handleAnalyzeHttp` 的 HTTP 對應（去除存取控制後，本 Feature 必須完全相同）：

| 情況 | status | body |
| ---- | ------ | ---- |
| Content-Type 不是 JSON | 415 | `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }` |
| body 超過 4 MB（宣告或實際） | 413 | `{ error: "payload_too_large" }` |
| JSON 解析失敗（含空 body） | 400 | `{ error: "invalid_request", details: ["body 不是合法 JSON"] }` |
| `invalid_request` | 400 | `{ error: "invalid_request", details }` |
| `payload_too_large`（frames > 3000） | 413 | `{ error: "payload_too_large" }`（**不帶 details**） |
| `insufficient_frames` | 422 | `{ error: "insufficient_frames", acceptedFrames }` |
| 成功 | 200 | 契約 v1.0.0 物件 |
| 非預期例外（含讀 body 時串流出錯） | 500 | `{ error: "internal_error" }` |
| 非 POST | 405 | Next 自動回應 |

## Goals

### 1. 目錄與檔名

```
app/
  api/
    analyze/
      route.js                    # 新增：POST、runtime；只轉呼叫 handleAnalyzeHttp
lib/
  server/
    http-handler.js               # 新增：框架無關的 HTTP 流程（server-only）
    access-control.js             # 新增：存取控制單一接入點；1.3 為放行 stub（server-only）
    analyze.js                    # 1.2，不動
    validate-request.js           # 1.2，不動
next.config.mjs                   # 修改：headers() 對 /api/:path* 設 Cache-Control: no-store
tests/
  api-analyze-route.test.js       # 新增：不需要樣本，永遠執行
  baseline.test.js                # 擴充：三份 landmarks 經 POST 的逐值比對
  core-modules.test.js            # 擴充：route.js 的 import 限制
docs/
  server-api.md                   # 新增
```

- `lib/server/*.js` 第一個 statement 一律是 `import "server-only";`（`core-modules.test.js` 會自動涵蓋新檔）。
- `app/api/analyze/route.js` **不加** `import "server-only"`（Route Handler 本來就只在 Server 執行），且只 import `../../../lib/server/http-handler.js`，不直接 import `lib/core`、`analyze.js`。
- 相對路徑加 `.js` 副檔名（`@/` 別名仍未設定）。

### 2. `app/api/analyze/route.js`

```js
import { handleAnalyzeHttp } from "../../../lib/server/http-handler.js";

export const runtime = "nodejs";

// HTTP 流程在 lib/server/http-handler.js；存取控制接入點在 lib/server/access-control.js。
// 不記錄請求內容，錯誤不回傳 stack。
export async function POST(request) {
  return handleAnalyzeHttp(request);
}
```

- 只 export `runtime` 與 `POST`。不 export `GET`／`PUT`／`OPTIONS` 等（交給 Next 自動 405／OPTIONS，見第 6 節與待決定事項 4）。
- 不 export `dynamic`、`maxDuration`、`preferredRegion`（`maxDuration` 若有需要於 4.1 依 Vercel 方案決定）。
- 模組層級不得有副作用（不讀 `process.env`、不建立狀態）；Epic 2 的限流狀態放在 `access-control.js` 內。

### 3. `lib/server/http-handler.js` — `handleAnalyzeHttp`

#### 3.1 簽名

```js
export async function handleAnalyzeHttp(request, { analyze = analyzeRequest, checkAccess = defaultCheckAccess } = {})
```

- `request`：標準 Web `Request`（實際執行時是 `NextRequest`，但只用標準 API）。
- 第二個參數只供測試注入（模擬核心丟例外、模擬存取被拒）；`route.js` 不傳。
- 同時匯出 `RESPONSE_HEADERS`（本 Feature 為 `{ "Cache-Control": "no-store" }`）與 `ERROR_STATUS`（第 3.4 節），供測試與 Epic 2 使用。

#### 3.2 處理順序（固定）

1. **存取控制**：`await checkAccess(request)`。被拒時直接回應，**不讀 body**（第 4 節）。
2. **Content-Type**：不符時回 415（判斷方式見待決定事項 2）。
3. **讀 body**：`readLimitedText(request)`（第 3.3 節）；超過上限回 413。
4. **JSON**：`JSON.parse(text)`；失敗回 400 `body 不是合法 JSON`。空 body（`""`）也屬此類。
5. **解算**：`analyze(body)`，依第 3.4 節對應狀態碼。
6. 整段包在 `try/catch`：任何例外回 500 `{ error: "internal_error" }`，只 `console.error("analyze failed")`，**不 log 例外物件、訊息、stack 或請求內容**。

#### 3.3 `readLimitedText(request)` — 串流讀取與上限

照搬舊 `readLimitedText`，語意如下：

- **預檢**：`Content-Length` 是有限數字且 `> LIMITS.maxBodyBytes` → 直接回 413，不讀 body。這只是提早拒絕，**不是唯一防線**：`Content-Length` 可能缺少（chunked）、偽造或比實際小。
- **實際計數**：`request.body` 為 `null` 時視為 `""`；否則用 `request.body.getReader()` 逐塊讀取，累加 `value.byteLength`；一旦 `total > LIMITS.maxBodyBytes` 就 `await reader.cancel()` 並回 413，不再讀取、不保留已讀內容。
- 恰好等於 `maxBodyBytes` **允許**（`>` 才拒絕）。
- 解碼：`Buffer.concat(chunks).toString("utf8")`（與舊行為相同：非法 UTF-8 變成替代字元；UTF-8 BOM 會保留並使 `JSON.parse` 失敗 → 400）。
- **不可**使用 `request.text()`／`request.json()`／`request.arrayBuffer()`：它們會先把整個 body 讀進記憶體，無法在超過上限時中止。
- 串流讀取中拋出的例外（例如 client 中斷）不在此攔截，由外層 `try/catch` 轉 500（與舊行為相同）。

#### 3.4 錯誤類型 → 狀態碼

```js
export const ERROR_STATUS = {
  invalid_request: 400,
  payload_too_large: 413,
  insufficient_frames: 422,
};
```

| `analyze()` 回傳 | HTTP |
| ---- | ---- |
| `{ ok: true, result }` | 200，body 為 `result` |
| `{ ok: false, error: "invalid_request", details }` | 400 `{ error, details }` |
| `{ ok: false, error: "payload_too_large", details }` | 413 `{ error }`（`details` 不回傳） |
| `{ ok: false, error: "insufficient_frames", acceptedFrames }` | 422 `{ error, acceptedFrames }` |
| 其他（不在 `ERROR_STATUS` 的錯誤類型） | 500 `{ error: "internal_error" }`（防呆；正常不會發生） |

- 回應 body **白名單組裝**（只放上表欄位），不得把 `analyze()` 的回傳物件整個轉送。
- `ERROR_STATUS` 的 key 必須與 `ANALYZE_ERRORS` 完全一致（測試檢查）。

#### 3.5 回應格式

- 統一用 `respond(body, status, extraHeaders)` → `Response.json(body, { status, headers: { ...RESPONSE_HEADERS, ...extraHeaders } })`。`Response.json` 會設 `Content-Type: application/json`。
- 錯誤 body 形狀固定為 `{ error: string, details?: string[], acceptedFrames?: number }`。錯誤碼字串只有：`invalid_request`、`payload_too_large`、`insufficient_frames`、`internal_error`（Epic 2 再加存取控制的錯誤碼）。
- 成功 body 是 1.2 的契約 v1.0.0 物件，**原樣**序列化（不重新排序、不加欄位）。欄位與順序見 `context/features/1-2-analyze-pipeline-contract.md` 第 4 節及 `docs/analysis-json-contract.md`。
- 任何回應都不得含 `stack`、例外訊息、檔案路徑、環境變數或請求內容（`profileName` 只在成功結果中原樣帶回）。
- 不設任何 `Access-Control-*` 標頭（無 CORS）。

### 4. 存取控制單一接入點 `lib/server/access-control.js`

```js
import "server-only";
// 存取控制單一接入點。Epic 2（2.1）在此實作 Origin／Sec-Fetch-Site 檢查與每 IP 限流；
// 其他檔案不得自行做存取判斷。1.3 為放行 stub。
/**
 * @param {Request} request
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, headers?: Record<string, string> }>}
 */
export async function checkAccess(request) {
  return { ok: true };
}
```

- `handleAnalyzeHttp` 在**讀 body 之前**呼叫它；`ok: false` 時以 `respond({ error }, status, headers)` 回應（`headers` 例如 2.1 的 `Retry-After`）。
- 介面只看 `request` 的標頭，不得讀 body（測試保證：被拒時 body 串流不會被讀取）。
- 1.3 不讀環境變數、不保存狀態、不記錄 IP。
- 2.1 只替換本檔內容（必要時連帶調整 `RESPONSE_HEADERS`），`route.js` 與 `http-handler.js` 的流程不變。

### 5. Content-Type

舊行為：`content-type` 小寫後 `includes("application/json")`，不符回 415 `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }`。

建議改為比對 media type 本體（見待決定事項 2）：`type.split(";")[0].trim().toLowerCase() === "application/json"`。原因：舊寫法會放行 `text/plain; x=application/json`，這種 Content-Type 屬於瀏覽器的 CORS-safelisted「simple request」，跨站表單或 `fetch(no-cors)` 可以不經 preflight 直接送出；嚴格比對後，跨站送 JSON 一定要 preflight，而本 API 不回 CORS 標頭，preflight 會失敗。這在 Epic 2 的 Origin 檢查上線前是一道實質防線。415 的 body 文字不變。

### 6. 非 POST 與 `Cache-Control: no-store`

- 非 POST（`GET`、`PUT`、`DELETE`、`PATCH`、`HEAD`）由 Next 自動回 405。`OPTIONS` 由 Next 自動實作（依文件會帶 `Allow`）。
- Handler 自己的每個回應（200／4xx／500）都由 `respond` 帶 `Cache-Control: no-store`。
- Next 自動產生的 405／OPTIONS 回應不經過 handler，所以在 `next.config.mjs` 加：

  ```js
  // /api 全部回應不得被快取（含 Next 自動回的 405／OPTIONS）；值須與 lib/server/http-handler.js 的 RESPONSE_HEADERS 一致。
  // 其餘安全標頭在 Epic 2（2.1）加入。
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
  ```

  保留既有的 `poweredByHeader: false`。
- Vitest 不經過 `next.config.mjs`，所以 405 與 OPTIONS 的標頭只能在 Verification 第 3 步用 `curl` 確認。若 `curl` 顯示 405 **沒有**帶 `no-store`，改採待決定事項 4 的 B 案（明確 export 其他方法回 405），並在 Notes 記錄。

### 7. 測試

#### 7.1 `tests/api-analyze-route.test.js`（不需要樣本，永遠執行）

直接 `import { POST, runtime } from "../app/api/analyze/route.js"`，以 `POST(new Request("http://localhost/api/analyze", { method: "POST", headers, body }))` 呼叫。需要串流 body 時加 `duplex: "half"`。輔助函式：`post(body, { headers })`、`json(res)`。

**route 模組**

- `runtime === "nodejs"`；模組 export 恰好是 `["POST", "runtime"]`（排序後比對）。

**成功與錯誤對應**（共用一組 5 幀以上的合成 landmarks，參考 1.2 `analyze.test.js` 的產生方式）

| 案例 | 預期 status | 預期 body |
| ---- | ---- | ---- |
| Content-Type 缺少、`text/plain`、`text/plain; x=application/json`（若待決定事項 2 選嚴格） | 415 | `{ error: "invalid_request", details: ["Content-Type 須為 application/json"] }` |
| `application/json; charset=utf-8`、`Application/JSON` | 不是 415 | — |
| body `"{"`、空 body、UTF-8 BOM + 合法 JSON | 400 | `{ error: "invalid_request", details: ["body 不是合法 JSON"] }` |
| body `null`、`[]`、`"x"`、`{}` | 400 | `error: "invalid_request"`，`details` 為字串陣列（`null` 時含「body 必須是 JSON 物件」） |
| 移植 1.2 `analyze.test.js` 的 `invalid_request` 案例（座標字串、`1e300`、`visibility: 2`、`cameraMode: "x"` 等） | 400 | `details` 與直接呼叫 `analyzeRequest` 的 `details` `toStrictEqual` |
| 3001 幀 | 413 | `toStrictEqual({ error: "payload_too_large" })`（沒有 `details`） |
| 5 幀同一組 landmarks | 422 | `{ error: "insufficient_frames", acceptedFrames }`，`acceptedFrames` 與 `analyzeRequest` 相同且 < 8；body 只有這兩個 key |

**body 上限**（`LIMITS.maxBodyBytes` 從 `lib/server/validate-request.js` import，不寫死）

- `Content-Length: maxBodyBytes + 1` 且實際 body 很小 → 413，且 body 串流**未被讀取**（用 `pull()` 會丟錯的 `ReadableStream` 驗證；若丟錯會變成 500）。
- **沒有 `Content-Length` 的串流 body**（`ReadableStream`，`duplex: "half"`），分塊送出合計 `maxBodyBytes + 1` bytes → 413；並驗證讀到超過上限後就停止：`pull()` 被呼叫的總量不超過上限加一塊，且 `cancel()` 被呼叫。
- `Content-Length` 宣告很小（例如 `10`）但串流實際送出超過上限 → 413（證明不只相信 `Content-Length`）。若 `Request` 建構子不允許手動設定與 body 不符的 `Content-Length`，改為直接對 `handleAnalyzeHttp` 傳入自訂物件（`{ headers: new Headers(...), body: stream }`）測試，並在測試註解說明。
- 恰好 `maxBodyBytes` bytes 的 body（例如合法 JSON 後補空白到剛好上限）→ **不是** 413（JSON 合法則進入解算，預期 400 或 422 皆可，斷言 `status !== 413`）。
- 413 的 body 為 `{ error: "payload_too_large" }`。

**例外與資訊外洩**（用 `handleAnalyzeHttp(request, { analyze })` 注入）

- `analyze` 丟出 `new Error("boom-secret")` → 500 `toStrictEqual({ error: "internal_error" })`；回應文字不含 `boom-secret`、`stack`、`Error`；`console.error` 只被呼叫一次，參數恰好是 `["analyze failed"]`（`vi.spyOn(console, "error").mockImplementation(() => {})`，測試後還原）。
- `analyze` 回傳未知錯誤類型 `{ ok: false, error: "weird" }` → 500 `internal_error`。
- body 串流在讀取中途 `error()` → 500 `internal_error`。
- 所有錯誤回應的文字都不含 `stack`、`at `（stack frame 樣式）、`node_modules`、`lib/`。

**存取控制接入點**

- 預設 `checkAccess` 回傳 `{ ok: true }`（直接 import `lib/server/access-control.js` 測試）。
- 注入 `checkAccess` 回傳 `{ ok: false, status: 403, error: "forbidden", headers: { "X-Test": "1" } }` → 403 `{ error: "forbidden" }`、帶 `X-Test` 與 `Cache-Control: no-store`；body 串流**未被讀取**；`analyze` 未被呼叫。
- `checkAccess` 在 Content-Type 檢查之前執行（注入拒絕＋錯誤 Content-Type → 回的是 403 而不是 415）。

**回應標頭**

- 上述**所有**回應（200／400／403／413／415／422／500）：`Cache-Control === "no-store"`、`Content-Type` 以 `application/json` 開頭、沒有任何 `access-control-*` 標頭。

**對應表完整性**

- `Object.keys(ERROR_STATUS).sort()` 等於 `[...ANALYZE_ERRORS].sort()`。

#### 7.2 `tests/baseline.test.js`（擴充，以 `REQUIRE_BASELINE=1 npm test` 執行）

新增 describe「`POST /api/analyze` 與 `analyzeRequest` 一致」，沿用既有 `BASELINE` 常數與 `load()`：

- 三份 landmarks（woman03／walkrun-a／walkrun-b）各自：
  1. `POST` 送出 `JSON.stringify(load("landmarks-<名稱>.json"))`（Content-Type `application/json`）→ 200，`Cache-Control: no-store`。
  2. 回應 JSON 的 `cadence` 等於 `BASELINE.landmarks`（193／176／150），`metrics` 的 `gctMs`／`flightMs`／`overallScore` 等於基準（193／118／66、192／149／90、230／170／75），`isWalking === false`。
  3. 刪除 `timestamp` 後，回應 JSON 與 `analyzeRequest(同一請求).result`（同樣刪除 `timestamp`）`toStrictEqual`，且 `Object.keys` 順序相同（證明 HTTP 層沒有改變任何欄位）。
  4. `summary` 與 `client-<名稱>.json` 的 `summary` `toStrictEqual`。
  5. `validateAnalysisJSON(回應)`：`ok: true`、`errors: []`、`warnings: []`。
- **walk 樣本 103／361ms／96**：此樣本是 summary 匯出檔（沒有 landmarks），**無法經過 `/api/analyze`**。既有的 walk summary 與 `kf-*-101` 測試保持不變並必須通過；本 Feature 以三份 landmarks 證明 HTTP 路徑，見待決定事項 1。

#### 7.3 `tests/core-modules.test.js`（擴充）

- `app/api/analyze/route.js` 原始碼的 import 只有 `../../../lib/server/http-handler.js`（不 import `lib/core`、`analyze.js`、`validate-request.js`）。
- `lib/server/http-handler.js`、`access-control.js` 第一個 statement 是 `import "server-only"`（既有 `serverFiles` 迴圈自動涵蓋，確認新檔有被列入即可）。
- `lib/server/http-handler.js` 原始碼不出現 `request.text(`、`request.json(`、`request.arrayBuffer(`（防止日後改回一次讀完整個 body）。

### 8. 隱私與 log

- 不記錄請求內容、`profileName`、IP、標頭。唯一的 log 是 500 時的 `console.error("analyze failed")`。
- 不在任何地方保存請求或結果。

### 9. 文件同步

- `docs/server-api.md`（新增，繁體中文）：只描述已實作的內容——端點、請求欄位（沿用舊文件「請求」一節）、回應（200 範例＋狀態碼表：400／405／413／415／422／500，以及「Vercel 平台 4.5 MB 上限由平台直接回 413、格式不同」）、處理順序（存取控制接入點 → 415 → 413 → 400 → 解算）、`Cache-Control: no-store`、無 CORS、log 政策。明確標註「存取控制（Origin、限流、其餘安全標頭）尚未實作，見 Epic 2；目前不可對外部署」。不寫舊專案的 API Key、環境變數與部署章節。
- `docs/planning/epics-and-features.md`：1.3 狀態與說明更新（串流上限、Content-Type、`Cache-Control`、存取控制接入點 `lib/server/access-control.js`）；2.1 說明補上「實作於 `lib/server/access-control.js`，其餘安全標頭加入 `RESPONSE_HEADERS` 與 `next.config.mjs` `headers()`」。
- `README.md`：本專案目前沒有，1.3 不新增；版本號不動。
- `docs/analysis-json-contract.md`：不變（沒有欄位變更，`schemaVersion` 維持 `1.0.0`）。

## 待決定事項（開工前確認）

1. **walk 樣本 103／361ms／96 如何「經 route 驗證」？** walk 樣本是 summary 匯出檔，沒有 landmarks，`/api/analyze` 無法處理它。
   - A：維持 `baseline.test.js` 既有 walk／`kf-*` 測試（必須通過），route 層以三份 landmarks 逐值比對證明。
   - B：另錄一份行走 landmarks 樣本（需要使用者在舊 Client 操作錄製），新增為第四份 route 基準。
   - （建議 A；B 可與「`isWalking` true 分支無樣本」的待處理一起做。）
2. **Content-Type 判斷要不要改嚴格？**
   - A：比對 media type 本體 `=== "application/json"`（第 5 節）。
   - B：照舊 `includes("application/json")`。
   - （建議 A：與舊行為只差在放行／拒絕「本體不是 `application/json` 但參數含此字串」的請求，正常 Client 不受影響；可擋下不需 preflight 的跨站 simple request。）
3. **安全標頭範圍**：本 Feature 只加 `Cache-Control: no-store`，其餘 4 個（`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Content-Security-Policy`）留給 2.1？（建議：是，依路線圖分工；2.1 只需在 `RESPONSE_HEADERS` 與 `next.config.mjs` 各加一行。若使用者希望 1.3 就照舊專案五個全加，成本也很低。）
4. **405 的實作方式**：
   - A：交給 Next 自動 405／OPTIONS，`no-store` 由 `next.config.mjs` `headers()` 補上（舊專案做法）。
   - B：`route.js` 明確 export `GET`、`PUT`、`DELETE`、`PATCH` 回 `respond({ error: "method_not_allowed" }, 405, { Allow: "POST" })`。
   - （建議 A：程式最少、與舊專案一致；只有在 `curl` 證實 A 的 405 沒有 `no-store` 時才改 B。）
5. **是否做一次「舊 HTTP handler vs 新 route」對照**（Verification 第 2 步）？在 scratchpad 寫一次性腳本，以 dev-open 設定（`readAccessConfig({ NODE_ENV: "development" })`）呼叫舊 `handleAnalyzeHttp`，與新 `POST` 比對同一組請求的狀態碼與 body（成功案例刪 `timestamp`）。唯讀執行舊專案，不改、不提交。（建議：做，是「HTTP 回應與舊 Server 完全相同」最直接的證據；Content-Type 若選嚴格，預期只有該案例不同。）

## Out of scope

- Origin／`Sec-Fetch-Site` 檢查、限流、存取控制錯誤碼（401／403／429）、`X-Content-Type-Options` 等其餘安全標頭（Epic 2.1；本 Feature 只留接入點）。
- 舊專案的 API Key、`RFA_*` 環境變數、503 `server_not_configured`。
- `proxy.js`、CORS、`maxDuration`、Vercel 設定與部署（4.1）。
- 任何 UI 或 Client 呼叫 API（3.3）。
- 修改 `lib/core/`、`lib/server/analyze.js`、`lib/server/validate-request.js`、`lib/contract/`；改變 `LIMITS`；契約升版。
- 新增 npm 依賴；修改舊專案；提交 `.temp/` 樣本。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。** build 輸出的路由表中 `/api/analyze` 為動態（`ƒ`）；`/` 仍正常。
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（含新的 `api-analyze-route.test.js` 與擴充後的 `baseline.test.js`、`core-modules.test.js`）。基準：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同（既有測試）；三份 landmarks 經 `POST` 193／176／150 與 metrics 基準一致、與 `analyzeRequest` 去 `timestamp` 後 `toStrictEqual`。另跑一次不帶變數的 `npm test`，確認缺樣本時 baseline 仍為 skip、route 測試照常執行。若做待決定事項 5，結論寫進 Notes。
3. **API 實測（`npm run dev`）**：以 Bash 執行 `curl`（PowerShell 下請用 `curl.exe`）。埠號以 dev server 實際輸出為準。大檔放 scratchpad，例如 `node -e "process.stdout.write('{\"a\":\"'+'x'.repeat(4*1024*1024)+'\"}')" > <scratchpad>/big.json`。

   | 指令 | 預期 |
   | ---- | ---- |
   | `curl -s -i -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" --data-binary @.temp/json/landmarks-woman03.json` | 200；`cadence` 193；`Cache-Control: no-store`；無 `Access-Control-*`、無 `X-Powered-By` |
   | `curl -s -i -X POST …/api/analyze -H "Content-Type: application/json" --data-binary "{"` | 400 `body 不是合法 JSON` |
   | `curl -s -i -X POST …/api/analyze -H "Content-Type: application/json" -d "{}"` | 400 `invalid_request`，含 details |
   | `curl -s -i -X POST …/api/analyze -H "Content-Type: text/plain" -d "{}"` | 415 |
   | 5 幀合成請求（scratchpad 檔案） | 422 `insufficient_frames` |
   | `curl -s -i -X POST …/api/analyze -H "Content-Type: application/json" --data-binary @<scratchpad>/big.json` | 413 `payload_too_large`（`Content-Length` 預檢路徑） |
   | 同上加 `-H "Transfer-Encoding: chunked"`（不帶 `Content-Length`） | 413（串流計數路徑） |
   | `curl -s -i -X GET …/api/analyze`；`-X PUT`；`-X DELETE` | 405，帶 `Cache-Control: no-store`，無 `Access-Control-*`；記錄是否帶 `Allow` |
   | `curl -s -i -X OPTIONS …/api/analyze` | 記錄狀態碼與 `Allow`；無 `Access-Control-*` |

   上述案例都不會觸發 500，dev server 終端機不應出現 `analyze failed` 或其他錯誤；若出現即需調查。
4. **Playwright**：因有 API 變更，載入 `http://localhost:3000/`，確認 console 無 error、無資源 404（首頁應與 1.2 相同）。本 Feature 無互動變更，略過 `AGENTS.md` 第 4 項，於 Notes 註明。
5. **server-only 與 bundle**：`.next/static/` 搜尋不到核心特有字串（例如 `"嚴重跨步煞車或身後推蹬"`）與 `analyze failed`，確認 route 沒有把核心或 handler 帶進瀏覽器。
6. `git status` 只有本 Feature 的檔案；`.temp/` 未被提交；舊專案沒有任何變更；dev server 已關閉。

## 風險

- **`Request` 與 `Content-Length` 的測試限制**：Node 的 `Request` 建構子可能忽略或覆寫手動設定的 `Content-Length`，導致「宣告很小、實際很大」的案例在 `POST(new Request(...))` 下無法構造。規格已允許改用自訂 request 物件直接測 `handleAnalyzeHttp`；`curl` 的 chunked 案例另外證明實際伺服器行為。
- **Next 自動 405 的標頭**：`next.config.mjs` `headers()` 是否套用到 Next 自動產生的 405／OPTIONS，只能用 `curl` 確認（舊專案經驗是會套用，但版本不同）。失敗時改採待決定事項 4 的 B 案。
- **平台上限**：Vercel Function 的請求上限約 4.5 MB，超過時平台直接回 413（不經本 API、格式不同）；本 API 的 4 MB 上限在其內。本地 dev 沒有這層，部署後（4.1）須實測。
- **Epic 2 若使用 `proxy.js`**：Next 會先緩衝 body（預設 10 MB），超過只截斷不報錯，route 可能收到不完整 body 而回 400 而非 413，且大 body 會先佔用記憶體。2.1 應把存取控制放在 `access-control.js`（route 內、讀 body 之前），不要放進 proxy；若一定要用 proxy，須評估 `proxyClientMaxBodySize`。
- **`runtime` export 與 Cache Components**：若日後在 `next.config.mjs` 啟用 `cacheComponents`，必須移除 `export const runtime`，否則 build 失敗或警告。在 `route.js` 註解中註明。
- **`Buffer` 依賴 Node runtime**：`readLimitedText` 用 `Buffer.concat`，只在 Node runtime 可用；`runtime = "nodejs"` 明列即為此保證。改 edge 已不被支援。
- **500 遮蔽錯誤**：串流中斷、未知錯誤類型都回 500 且只 log 固定字串，除錯資訊很少。這是刻意的隱私取捨；開發時若需細節，暫時在本機加 log，不提交。
- **Content-Type 改嚴格**（若選待決定事項 2 的 A）：與舊 Server 的 HTTP 行為有一處刻意差異，須在 `docs/server-api.md` 與 Notes 記錄。
