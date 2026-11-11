# Feature 2.1 — 同源存取模型

## Status

`planned`

## Epic

Epic 2 — 存取控制（同源）

## Objective

把 1.3 預留的放行 stub `lib/server/access-control.js` 換成「方案 A」的實作，並補齊 `/api` 的安全標頭：

- **Origin／`Sec-Fetch-Site` 檢查**：瀏覽器發出的跨來源（含同站不同源）請求回 403 `forbidden`；同源請求放行；沒有這兩個標頭的非瀏覽器請求（curl、測試、腳本）放行，交給限流把關（第 4 節）。
- **每 IP 記憶體式限流**：固定視窗、每 IP 每 60 秒 30 次，超過回 429 `rate_limited`＋`Retry-After`；狀態有上限、會清理（第 5 節）。
- **其餘安全標頭**：`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Content-Security-Policy` 加入 `RESPONSE_HEADERS` 與 `next.config.mjs` `headers()`，兩處以測試保證一致（第 6 節）。
- **無 CORS**：任何回應都不帶 `Access-Control-*`。
- `docs/server-api.md` 如實記載：限流在 serverless 上**僅盡力而為**。

**單一模組原則**：存取判斷只存在於 `lib/server/access-control.js`。`app/api/analyze/route.js` 不變；`lib/server/http-handler.js` 只改 `RESPONSE_HEADERS` 的內容與註解，**處理流程與 `checkAccess` 介面不變**（1.3 第 4 節的回傳形狀原樣沿用）。

**計算行為零變更**：不修改 `lib/core/`、`lib/server/analyze.js`、`lib/server/validate-request.js`、`lib/contract/`。基準 walk 103／361ms／96、三份 landmarks 193／176／150 必須照舊通過。

## Next.js 16.4.6 與執行環境查證

| 主題 | 來源 | 結論 |
| ---- | ---- | ---- |
| `headers()` | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md` | 回傳 `{ source, headers: [{ key, value }] }[]`；「Headers are checked before the filesystem」；同一路徑多條規則設同一 key 時**後者覆蓋前者**。1.3 已實測 `/api/:path*` 規則會套到 Next 自動回的 405／OPTIONS |
| `X-Frame-Options` | 同上 | 文件註明已被 CSP `frame-ancestors` 取代；本專案兩者都設（相容舊瀏覽器，與舊專案一致） |
| Next 對 `x-forwarded-for` 的處理 | `node_modules/next/dist/server/base-server.js` 約第 604 行 | `req.headers['x-forwarded-for'] ??= socket.remoteAddress`：**只在缺少時補上**，client 自帶的值會被保留。因此在 `next dev`／`next start` 直接對外時 XFF **可偽造** |
| Vercel 的 IP 標頭 | Vercel 官方文件（Request headers） | Vercel 邊緣會**覆寫** `x-forwarded-for` 與 `x-real-ip` 為連線端公開 IP，不轉送外部自帶的值（防偽造）。前提是 Vercel 是最外層；若前面再架其他代理（例如 Cloudflare），取得的是該代理的 IP。4.1 部署後須實測 |
| `proxy.js`（原 middleware） | 1.3 規格「風險」 | Next 會先緩衝 body（預設 10 MB，超過只截斷）。**2.1 不使用 `proxy.js`**，存取控制留在 route 內、讀 body 之前（1.3 已預留） |
| `server-only` 與 `next.config.mjs` | — | `next.config.mjs` 在一般 Node 條件下載入，不能 import 帶 `import "server-only"` 的 `lib/server/*.js`（會丟錯）。因此標頭值在兩處各寫一份，以測試比對一致（第 6 節） |

## 舊專案現況（唯讀盤點）

| 舊檔 | 內容 | 本 Feature 處理 |
| ---- | ---- | ---- |
| `server/lib/rate-limit.js` | `createRateLimiter({ windowMs, maxEntries = 10000 })`，固定視窗；`hit(bucket, limit, now)` 回 `{ ok }` 或 `{ ok: false, retryAfterSec }`；滿時先刪過期、再刪最舊；`retryAfterSec = max(1, ceil((resetAt - now) / 1000))` | 演算法沿用，改寫進 `access-control.js`（單一模組）；視窗重置時改為 `delete` 後 `set`，讓「最舊」等於「視窗最早開始」（第 5.4 節） |
| `server/lib/access-config.js` | 預設 `windowMs: 60000`、`perKey: 20`、`perIp: 30`，可由 `RFA_RATE_LIMIT_*` 環境變數覆寫 | 沿用 60 秒／30 次；**不搬**環境變數與 API Key（方案 A 無 key） |
| `server/lib/http-handler.js` | `clientIp`：XFF 第一段 → `x-real-ip` → `"unknown"`；429 body `{ error: "rate_limited", retryAfterSec }`＋`Retry-After`；`SECURITY_HEADERS` 5 個 | `clientIp` 沿用並加長度上限；429 body 改為只有 `{ error }`（第 5.5 節）；5 個標頭原值搬入 `RESPONSE_HEADERS` |
| `server/next.config.mjs` | `headers()` 對 `/api/:path*` 設同樣 5 個標頭 | 照搬 |
| 舊 Origin 檢查 | 無（舊專案靠 API Key） | 新寫（第 4 節） |

## 範圍

### 目錄與檔名

```
lib/server/
  access-control.js         # 改寫：Origin／Sec-Fetch-Site 檢查＋每 IP 限流（server-only）
  http-handler.js           # 只改 RESPONSE_HEADERS 內容與註解；流程不變
next.config.mjs             # headers() 補其餘 4 個安全標頭
tests/
  access-control.test.js    # 新增：單元測試（假時鐘），不需要樣本
  api-analyze-route.test.js # 擴充：403／429 經 POST、標頭一致性；加 beforeEach 重置限流狀態
  core-modules.test.js      # 擴充：access-control.js 的 import 限制
docs/
  server-api.md             # 更新
  planning/epics-and-features.md  # 2.1 狀態與說明
```

- `app/api/analyze/route.js` **不改**。
- `access-control.js` 第一個 statement 維持 `import "server-only"`；除此之外**不 import 任何模組**（不需要 `node:` 內建模組）。
- 不新增 npm 依賴、不新增 `proxy.js`、不讀 `process.env`。

### 非範圍

- 頁面（`/`）的安全標頭與 CSP：頁面將載入 MediaPipe（CDN、wasm、可能用到 camera／worker），CSP 要在 3.2 搬入 Client 後依實際資源決定，2.1 只處理 `/api/:path*`。
- Turnstile、登入、API Key、外部限流儲存（Upstash Redis；路線圖「待處理」，對外開放前評估）。
- 以環境變數覆寫限流數值（需使用者到 Vercel 設定，留待有需要時）。
- IPv6 以 /64 為單位限流（見「已知風險」）。
- `maxDuration`、Vercel 設定與部署（4.1）；隱私說明完整化（2.2）。
- Client 呼叫 API 與 429 的 UI 呈現（3.3）。
- 修改核心、`LIMITS`、契約；修改舊專案；提交 `.temp/`。

## 設計決策

### 1. 模組形狀（`lib/server/access-control.js`）

```js
import "server-only";
// 存取控制單一接入點（方案 A）：Origin／Sec-Fetch-Site 檢查 → 每 IP 固定視窗限流。
// 只讀標頭，不讀 body；不記錄 IP 與標頭。限流狀態只在本 instance 記憶體中，serverless 下僅盡力而為。

export const ACCESS_LIMITS = Object.freeze({
  windowMs: 60_000,      // 限流視窗
  maxRequests: 30,       // 每 IP 每視窗上限
  maxTrackedIps: 10_000, // 記憶體中最多追蹤的 IP 數
  maxIpLength: 45,       // IPv6 文字表示最長 45 字元；超過視為無法辨識
});

export function getClientIp(request) { /* 第 5.2 節 */ }
export function checkOrigin(request) { /* 第 4 節；回傳 true／false */ }

export function createAccessControl({ now = Date.now, ...limits } = {}) {
  // limits 未給的欄位用 ACCESS_LIMITS
  return {
    checkAccess: async (request) => { /* 第 3 節 */ },
    trackedCount: () => /* 目前 Map 大小，供測試 */,
    reset: () => /* 清空 Map，供測試 */,
  };
}

const defaultInstance = createAccessControl();
export const checkAccess = defaultInstance.checkAccess;   // http-handler.js 既有的 import 名稱不變
export const resetAccessControlState = defaultInstance.reset; // 只供測試
```

- `http-handler.js` 仍是 `import { checkAccess as defaultCheckAccess } from "./access-control.js"`，不需修改 import。
- 預設實例（含 `Map`）在模組載入時建立。1.3 規定「`route.js` 模組層級不得有副作用」，限流狀態本來就預定放在 `access-control.js`，不違反。

### 2. 設定值放哪裡：模組常數 `ACCESS_LIMITS`（不放 `APP_CONFIG`）

- `APP_CONFIG`（`lib/config.js`）是給 UI 的純資料（版本、名稱），會被非 server-only 的 `lib/contract/` import，**可能進入瀏覽器 bundle**；限流參數是 server 政策，不該跟著出貨，也不需要隨版本號發布。
- 與 1.2 的 `LIMITS`（`validate-request.js`）同一模式：server-only 模組內的凍結常數、匯出給測試。
- 不讀環境變數：方案 A 不需要任何 secret，部署不需設定即可運作；要調整就改常數並發版。

### 3. `checkAccess(request)` 流程與回傳形狀（與 1.3 接入點相容）

固定順序，**只讀 `request.headers` 與 `request.url`，不碰 `request.body`**：

1. `checkOrigin(request)` 為 `false` → `{ ok: false, status: 403, error: "forbidden" }`。
2. 取 `ip = getClientIp(request)`，對該 IP 計數（第 5 節）；超過上限 → `{ ok: false, status: 429, error: "rate_limited", headers: { "Retry-After": "<整數秒>" } }`。
3. 其餘 → `{ ok: true }`。

- 形狀完全落在 1.3 的 JSDoc：`{ ok: true } | { ok: false, status: number, error: string, headers?: Record<string, string> }`。`status` 只有 403／429（在 handler 防呆的 400–599 內）。
- **先檢查 Origin、再計數**：被拒的跨站請求不計入限流。否則惡意網頁可讓受害者的瀏覽器狂送跨站 POST，耗盡受害者 IP 的額度（受害者自己被 429）。
- 通過 Origin 的請求**一律計數**，不論之後是 200 還是 400／413／415／422／500（計數發生在讀 body 之前，正好擋大 body 灌入）。
- 不 log 任何東西（403／429 都不 log，避免攻擊時灌爆 log；也不記錄 IP）。

### 4. Origin／`Sec-Fetch-Site` 檢查規則（`checkOrigin`）

依序判斷，第一條命中即決定：

| # | 條件 | 結果 | 理由 |
| - | ---- | ---- | ---- |
| 1 | 有 `Sec-Fetch-Site`，值（trim、小寫）為 `same-origin` | 放行 | 瀏覽器保證、頁面 JS 無法偽造 |
| 2 | 有 `Sec-Fetch-Site`，值為 `none` | 放行 | 使用者直接發起（網址列、書籤），不是跨站攻擊；POST 實務上幾乎不會出現 |
| 3 | 有 `Sec-Fetch-Site`，其他任何值（`same-site`、`cross-site`、空字串、未知值） | 拒絕 | `same-site` 也拒：`*.vercel.app` 在 Public Suffix List 上，但自訂網域的子網域屬同站，不應信任 |
| 4 | 無 `Sec-Fetch-Site`、有 `Origin` | `Origin` 可解析、協定為 `http:`／`https:`、且 `new URL(origin).host` 等於期望 host → 放行；否則（含 `Origin: null`、無法解析）拒絕 | 舊版 Safari（< 16.4）等不送 `Sec-Fetch-*` 的瀏覽器 |
| 5 | 兩者皆無 | 放行 | 非瀏覽器 client（curl、Vitest、腳本）。它們可以任意偽造這兩個標頭，拒絕它們不增加安全性，只會增加使用成本；防濫用交給限流 |

- **期望 host**：`request.headers.get("host")`，沒有時用 `new URL(request.url).host`（Vitest 的 `new Request("http://localhost/...")` 沒有 `Host` 標頭，會走這條）。兩邊都轉小寫比較。
- **只比 host（含非預設 port），不比協定**：Vercel 在邊緣終結 TLS，函式內看到的協定不一定是 `https`；同 host 的攻擊者不存在（能控制同 host 就已同源）。
- 規則 1／2 命中時**不再看 `Origin`**：同源時兩者必然一致，額外比對只會在代理改寫 `Host` 時造成誤拒。
- 這個檢查的定位是**擋瀏覽器端的跨站濫用（CSRF 類、他站嵌入呼叫）**，不是驗證 client 身分。1.3 的 Content-Type 嚴格比對已讓跨站 JSON 必須 preflight，本 API 無 CORS 使 preflight 失敗；Origin 檢查再擋住 `no-cors`／表單等其他路徑，兩者互補。

### 5. 每 IP 記憶體式限流

#### 5.1 演算法：固定視窗（沿用舊專案）

- `Map<ip, { count, resetAt }>`。命中時：沒有紀錄或 `now >= resetAt` → 開新視窗 `{ count: 0, resetAt: now + windowMs }`；`count += 1`；`count > maxRequests` → 拒絕。
- 第 31 次（含）起拒絕；被拒的請求**也計數**（`count` 繼續增加，不影響結果，與舊行為相同）。
- 選固定視窗而非滑動視窗／token bucket：狀態最小（每 IP 兩個數字）、`Retry-After` 好算、舊專案已驗證；代價是視窗交界可短時間內通過最多 2 × 30 次，對本服務可接受。
- `now` 由 `createAccessControl({ now })` 注入，測試用假時鐘，不使用 `vi.useFakeTimers`。

#### 5.2 IP 取得（`getClientIp`）

1. `x-forwarded-for` 的**第一段**（以 `,` 分割、trim）。
2. 否則 `x-real-ip`（trim）。
3. 否則、或取得的字串為空或長度 > `maxIpLength` → `"unknown"`。

- **信任前提**：只有在 Vercel 為最外層時可信（Vercel 覆寫這兩個標頭）。本地 `next dev`／`next start` 時 Next 只在缺少時補 XFF，client 自帶的值會被採用（可偽造）——本地不對外，可接受；文件須寫明「不要把 `next start` 直接暴露在網路上」。
- 不做 IP 格式驗證或正規化（例如 IPv4-mapped IPv6）：Vercel 給的值格式穩定；長度上限只是為了防止偽造超長字串佔用記憶體。
- `"unknown"` 是**共用桶**，照常限流（安全側失敗）。在 Vercel 不應出現；Vitest 的請求沒有 IP 標頭，全部落在這個桶（見 7.2 的重置）。

#### 5.3 視窗與上限

- `windowMs = 60_000`、`maxRequests = 30`（沿用舊專案 `perIp`）。正常使用是「一支影片一次 POST」，30 次／分鐘遠高於人工操作；同一 NAT 後多人（公司、校園、行動網路 CGNAT）共用時也留有餘裕。

#### 5.4 記憶體清理

- 上限 `maxTrackedIps = 10_000` 筆（每筆約百 bytes，總量約 1 MB 級）。
- 只在「要新增一筆、且 `Map.size >= maxTrackedIps`」時清理：先刪所有 `now >= resetAt` 的過期筆；仍滿則依插入順序刪最舊的，直到有空位。
- **開新視窗時先 `delete` 再 `set`**（舊專案是原地 `set`，不會更新插入順序）。如此 Map 的插入順序等於視窗開始順序；清完過期後剩下的都尚未過期，最舊的就是最快到期的，刪掉它只讓那個 IP 提早重置，影響最小。
- 不設計時器（`setInterval`）：serverless 下計時器不可靠且會阻止 instance 閒置；清理成本 O(n) 只在滿載時發生。
- 已知取捨：攻擊者若能以大量不同 IP 灌滿 10,000 筆，會把其他 IP 的計數擠掉（等同提早重置）。在 Vercel 上偽造 IP 不可行，需要真的擁有大量 IP；屬盡力而為的限制。

#### 5.5 429 回應與 `Retry-After`

- `Retry-After` = `String(Math.max(1, Math.ceil((resetAt - now) / 1000)))`，單位秒、整數、至少 1。
- body 為 `{ error: "rate_limited" }`，**不含**舊專案的 `retryAfterSec`。原因：1.3 handler 只轉送 `error` 與 `headers`（白名單），要放進 body 就得改 handler 與介面；秒數已在標準標頭中，同源 Client（3.3）可直接讀 `Retry-After`（同源不需 `Access-Control-Expose-Headers`）。
- 429、403 與其他回應一樣帶全部 `RESPONSE_HEADERS`。

### 6. 安全標頭：`RESPONSE_HEADERS` ＋ `next.config.mjs headers()`

`lib/server/http-handler.js`：

```js
// 值與順序須與 next.config.mjs headers() 的 /api/:path* 規則一致（tests 比對）
export const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
```

`next.config.mjs` 的 `/api/:path*` 規則列出同樣 5 個 `{ key, value }`，順序相同；註解改為「值須與 `RESPONSE_HEADERS` 一致，由 `tests/api-analyze-route.test.js` 比對」。保留 `poweredByHeader: false`。

- 兩處都要：handler 的 `respond` 涵蓋 200／4xx／500；`headers()` 涵蓋 Next 自動回的 405／OPTIONS（不經 handler）。值相同，誰覆蓋誰不影響結果。
- 無法共用同一份常數（`next.config.mjs` 不能 import server-only 模組；另建非 server-only 的常數檔則違反「`lib/server` 第一行 server-only」慣例），改以測試保證一致：測試 `import nextConfig from "../next.config.mjs"`，`await nextConfig.headers()` 取 `source === "/api/:path*"` 的規則，`Object.fromEntries(headers.map(h => [h.key, h.value]))` 與 `RESPONSE_HEADERS` `toStrictEqual`，且 key 順序相同。
- CSP `default-src 'none'` 對 JSON 回應無副作用（不載入任何子資源）；`frame-ancestors 'none'` 與 `X-Frame-Options: DENY` 防止 API 回應被嵌入。

### 7. 無 CORS

- 不設任何 `Access-Control-*` 標頭，不處理 preflight。`OPTIONS` 由 Next 自動回 204＋`Allow`（不經 `checkAccess`），沒有 `Access-Control-Allow-Origin`，瀏覽器的跨源 preflight 因此失敗——這正是預期行為。
- 測試對**所有**回應（含 403／429）斷言沒有 `access-control-*` 標頭。

### 8. 測試的限流狀態

- Vitest 每個測試檔有獨立的模組實例，但同一檔內共用預設實例。`api-analyze-route.test.js` 有數十次 `POST`，全部落在 `"unknown"` 桶，會在第 31 次起變成 429。
- 處理：該檔加 `beforeEach(() => resetAccessControlState())`。`baseline.test.js` 只有 3 次 `POST`，不需要，但若日後增加須比照。
- 不採用 `vi.mock` 換掉 access-control：要保留「真實 `checkAccess` 經 `POST`」的整合測試。也不採用「測試環境自動停用限流」：生產程式碼不得依環境改變安全行為。

## 驗收標準

1. 跨源（`Sec-Fetch-Site: cross-site`／`same-site`，或無 `Sec-Fetch-Site` 但 `Origin` 不符／為 `null`）的 `POST /api/analyze` 回 403 `{ error: "forbidden" }`，body 未被讀取、`analyze` 未被呼叫。
2. 同源（`Sec-Fetch-Site: same-origin` 或 `none`，或 `Origin` host 相符）與無兩標頭的請求，行為與 1.3 完全相同（狀態碼與 body）。
3. 同一 IP 在 60 秒內第 31 次起回 429 `{ error: "rate_limited" }`，帶 `Retry-After`（1–60 的整數秒）；視窗過後恢復；不同 IP 互不影響；被 403 拒絕的請求不計數。
4. 限流狀態不超過 `maxTrackedIps` 筆，過期筆會被清掉。
5. 所有 handler 回應（200／400／403／413／415／422／429／500）與 Next 自動的 405／OPTIONS 都帶 5 個安全標頭，且沒有 `Access-Control-*`、沒有 `X-Powered-By`。
6. `RESPONSE_HEADERS` 與 `next.config.mjs` 的 `/api/:path*` 規則逐項一致（測試）。
7. `route.js` 未改；`http-handler.js` 只有 `RESPONSE_HEADERS` 與註解變更（`git diff` 確認）；`checkAccess` 回傳形狀符合 1.3 JSDoc。
8. `REQUIRE_BASELINE=1 npm test` 全過，基準不變：walk 103／361ms／96、`kf-walk-101`／`kf-hsu-101` 逐字相同、三份 landmarks 經 `POST` 193／176／150 且與 `analyzeRequest` 去 `timestamp` 後 `toStrictEqual`。
9. 不 log IP、標頭或請求內容；唯一 log 仍是 500 的 `analyze failed`。
10. `docs/server-api.md` 記載 403／429、規則、標頭，並明寫「限流僅盡力而為」及其原因。

## 測試案例清單

### `tests/access-control.test.js`（新增，不需要樣本，永遠執行）

輔助：`req(headers, url = "http://localhost/api/analyze")` 建 `new Request(url, { method: "POST", headers })`；假時鐘 `let t = 1_000_000; const ac = createAccessControl({ now: () => t })`。

**`checkOrigin`**

| 標頭 | 預期 |
| ---- | ---- |
| （無） | `true` |
| `Sec-Fetch-Site: same-origin` | `true` |
| `Sec-Fetch-Site: SAME-ORIGIN `（大小寫、空白） | `true` |
| `Sec-Fetch-Site: none` | `true` |
| `Sec-Fetch-Site: same-site` | `false` |
| `Sec-Fetch-Site: cross-site` | `false` |
| `Sec-Fetch-Site: ` 空字串、`Sec-Fetch-Site: weird` | `false` |
| `Sec-Fetch-Site: same-origin` ＋ `Origin: https://evil.example` | `true`（規則 1 優先，見設計決策 4） |
| `Sec-Fetch-Site: cross-site` ＋ `Origin: http://localhost` | `false` |
| 只有 `Origin: http://localhost`（URL host 為 `localhost`） | `true` |
| 只有 `Origin: http://LOCALHOST` | `true` |
| 只有 `Origin: http://localhost:3000`，URL `http://localhost:3000/api/analyze` | `true` |
| 只有 `Origin: http://localhost:3001`，URL `http://localhost:3000/...` | `false`（port 不同） |
| 只有 `Origin: https://localhost`（協定不同、host 相同） | `true`（只比 host） |
| 只有 `Origin: https://evil.example` | `false` |
| 只有 `Origin: null` | `false` |
| 只有 `Origin: not a url` | `false` |
| 只有 `Origin: ftp://localhost` | `false` |
| `Host: app.example.com` ＋ `Origin: https://app.example.com`（URL 為 `http://localhost/...`） | `true`（`Host` 優先於 URL） |
| `Host: app.example.com` ＋ `Origin: http://localhost` | `false` |

**`getClientIp`**

- `x-forwarded-for: 203.0.113.5` → `203.0.113.5`；`" 203.0.113.5 , 10.0.0.1"` → `203.0.113.5`。
- 無 XFF、`x-real-ip: 198.51.100.7` → `198.51.100.7`；兩者皆有 → 取 XFF。
- XFF 為 `""` 或 `" , 10.0.0.1"` 且無 `x-real-ip` → `"unknown"`。
- 兩者皆無 → `"unknown"`。
- 46 字元的字串 → `"unknown"`；45 字元 IPv6（例如 `ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255`）→ 原值。

**限流（`ac.checkAccess`，同一 IP）**

- 第 1～30 次 `toStrictEqual({ ok: true })`；第 31 次 `toStrictEqual({ ok: false, status: 429, error: "rate_limited", headers: { "Retry-After": "60" } })`。
- 第 31 次後 `t += 59_001` → 再呼叫仍 429，`Retry-After === "1"`；`t += 999`（距開窗恰好 60_000）→ `{ ok: true }`（新視窗）。
- `t` 推進 500 ms 後被拒 → `Retry-After === "60"`（`ceil(59.5)`）；`Retry-After` 永遠符合 `/^[1-9]\d*$/` 且 ≤ 60。
- 另一 IP 在第一個 IP 被限時仍 `ok: true`。
- 無 IP 標頭的請求共用 `"unknown"` 桶（30 次後 429）。
- 跨站請求（`Sec-Fetch-Site: cross-site`）連送 100 次全部 `{ ok: false, status: 403, error: "forbidden" }`（`toStrictEqual`，沒有 `headers`），之後同一 IP 的同源請求仍有完整 30 次額度。
- 同時跨站且已超限：回 403（Origin 先判斷）。
- `createAccessControl({ maxRequests: 2, windowMs: 1000, now })` 可覆寫參數；未給的欄位用 `ACCESS_LIMITS`。

**記憶體清理**（`createAccessControl({ maxTrackedIps: 3, now })`）

- 4 個不同 IP 各一次 → `trackedCount() <= 3`，第 4 個 `ok: true`。
- 3 個 IP 到期後（`t += windowMs`）再來 1 個新 IP → 過期筆被清除，`trackedCount() === 1`。
- 均未到期且滿時，被擠掉的是最早開窗的 IP：該 IP 再來時從 1 重新計數；其他 IP 的計數保留（例如先把 IP B 打到 30 次，擠掉 A 之後 B 仍被 429）。
- 已存在的 IP 開新視窗後，插入順序移到最後（先開窗 A、B、C，A 過期後重開，再加入 D 且 B、C 未過期 → 被擠掉的是 B，不是 A）。
- `reset()` 後 `trackedCount() === 0`，先前被限的 IP 恢復。

**介面與不讀 body**

- `ACCESS_LIMITS` 被凍結，值為 `{ windowMs: 60000, maxRequests: 30, maxTrackedIps: 10000, maxIpLength: 45 }`。
- 預設匯出 `checkAccess` 對無標頭請求回 `{ ok: true }`（1.3 既有案例照舊）；`resetAccessControlState` 是函式。
- 傳入 body 為 `pull()` 會丟錯的 `ReadableStream`（`duplex: "half"`）時，放行、403、429 三種結果都不會丟錯（body 未被讀取）。
- 所有拒絕結果的 `status` 為 403 或 429，`error` 為 `"forbidden"` 或 `"rate_limited"`；`headers` 只在 429 出現，且只有 `Retry-After`。

### `tests/api-analyze-route.test.js`（擴充）

- `beforeEach(() => resetAccessControlState())`。既有 1.3 案例全部照舊通過（無標頭 → 放行）。
- **403 經 POST**：`Sec-Fetch-Site: cross-site`＋合法 JSON → 403 `toStrictEqual({ error: "forbidden" })`；body 串流未被讀取（`pull()` 丟錯的串流，若被讀會變成 500）。另一案：無 `Sec-Fetch-Site`、`Origin: https://evil.example` → 403。
- **同源經 POST**：`Sec-Fetch-Site: same-origin`＋`Origin: http://localhost`＋5 幀合成 landmarks → 422（與無標頭時相同的 body）。
- **429 經 POST**：同一 `x-forwarded-for` 連送 31 次 `{}`（`application/json`）→ 前 30 次 400，第 31 次 429 `toStrictEqual({ error: "rate_limited" })`、`Retry-After` 符合 `/^\d+$/` 且介於 1–60；第 31 次即使 Content-Type 錯誤也是 429（存取控制在 415 之前）。
- **標頭**：既有「所有回應」斷言從只看 `Cache-Control` 改為：對 200／400／403／413／415／422／429／500 每一種，`RESPONSE_HEADERS` 的每個 key 值都相符、`Content-Type` 以 `application/json` 開頭、無 `access-control-*`。
- **`RESPONSE_HEADERS` 內容**：`toStrictEqual` 第 6 節的 5 個鍵值，且 `Object.keys` 順序相同。
- **與 `next.config.mjs` 一致**：見設計決策 6；另斷言 `nextConfig.poweredByHeader === false`、`/api/:path*` 規則的 key 中沒有 `Access-Control-*`。

### `tests/core-modules.test.js`（擴充）

- `access-control.js` 的 import 只有 `"server-only"`（不 import `node:*`、`lib/core`、`analyze.js` 等）。
- `access-control.js` 原始碼（去註解）不出現 `.body`、`.text(`、`.json(`、`.arrayBuffer(`、`console.`、`process.env`。
- `access-control.js` 不 import `../config.js`（設定不放 `APP_CONFIG`）。

### `tests/baseline.test.js`（不改，必須通過）

- `REQUIRE_BASELINE=1 npm test`：walk 103／361ms／96、`kf-*-101` 逐字相同；三份 landmarks 經 `POST`（無 Origin 標頭 → 放行，3 次遠低於上限）193／176／150，metrics 與 1.3 相同、去 `timestamp` 後與 `analyzeRequest` `toStrictEqual`。

## 文件更新

### `docs/server-api.md`

- 頂端警告改為：「存取控制採同源模型（方案 A）。限流為每個 serverless instance 的記憶體計數，**僅盡力而為**，不是嚴格配額。Client 尚未呼叫此 API（Epic 3）。」移除「目前不可對外部署」，改為「部署見 4.1」。
- 「架構」：`access-control.js` 的描述改為實作內容與 `ACCESS_LIMITS`。
- 新增「存取控制」一節：
  - Origin／`Sec-Fetch-Site` 規則表（設計決策 4 的 5 條），並說明「無這兩個標頭的非瀏覽器請求會被放行，只受限流約束；這不是身分驗證」。
  - 限流：每 IP 每 60 秒 30 次、固定視窗、`Retry-After`；IP 取自 `x-forwarded-for` 第一段 → `x-real-ip` → 共用桶 `unknown`；只在 Vercel 為最外層時可信；不要把 `next start` 直接暴露在網路上。
  - **盡力而為的原因**（如實記載）：計數只在單一 instance 記憶體中；Vercel 會依流量同時執行多個 instance（實際上限可能是 30 × instance 數）；冷啟動或 instance 回收會歸零；同一 NAT 後的使用者共用額度；最多追蹤 10,000 個 IP，滿時最早的計數會被擠掉。需要嚴格限流時改用外部儲存（路線圖待處理：Upstash Redis）。
- 「處理順序」：存取控制（Origin 403 → 限流 429，只看標頭、不讀 body）→ 415 → 413 → 400 → 解算。
- 狀態碼表新增：
  - 403 `{ error: "forbidden" }`：瀏覽器跨源請求。
  - 429 `{ error: "rate_limited" }`＋`Retry-After`（秒）：超過每 IP 限流。
- 「回應」：列出 5 個安全標頭（也套用於 Next 自動回的 405／OPTIONS）；無 CORS。
- 「與舊 Server 的刻意差異」補上：沒有 API Key／401／503；429 body 不含 `retryAfterSec`（改看 `Retry-After`）；新增 Origin 檢查 403。
- 「隱私」補上：IP 只用於記憶體中的限流計數，不記錄、不寫入 log、不持久化，視窗過期或被擠出後即丟棄。

### `docs/planning/epics-and-features.md`

- 2.1 狀態改 `done`（`/feature complete` 時），說明補上：規則摘要、30 次／60 秒、403／429、5 個安全標頭、限流盡力而為。
- 2.2 說明不變（隱私說明完整化仍由 2.2 負責）。

### 其他

- `README.md`：本專案目前沒有，不新增；版本號不動。
- `docs/analysis-json-contract.md`：不變（`schemaVersion` 維持 `1.0.0`）。

## Verification

依 `AGENTS.md` 順序執行，結果寫入 `context/current-feature.md` 的 Notes。

1. **`npm run build` 成功、`npm run lint` 無錯誤。**
2. **`REQUIRE_BASELINE=1 npm test` 全部通過**（含新的 `access-control.test.js` 與擴充的測試）；基準見驗收標準 8。另跑一次不帶變數的 `npm test`，確認缺樣本時 baseline 仍 skip、其餘照常執行。
3. **`git diff` 檢查**：`app/api/analyze/route.js` 無變更；`lib/server/http-handler.js` 的差異只在 `RESPONSE_HEADERS` 與註解。
4. **API 實測（`npm run dev`）**：Bash 下執行 `curl`（PowerShell 用 `curl.exe`），埠號以實際輸出為準。

   | 指令 | 預期 |
   | ---- | ---- |
   | `curl -s -i -X POST …/api/analyze -H "Content-Type: application/json" --data-binary @.temp/json/landmarks-woman03.json` | 200、`cadence` 193；5 個安全標頭；無 `Access-Control-*`、無 `X-Powered-By` |
   | 同上加 `-H "Origin: http://localhost:3000"` | 200 |
   | 同上加 `-H "Sec-Fetch-Site: same-origin"` | 200 |
   | `-H "Origin: https://evil.example"` | 403 `{"error":"forbidden"}`，帶安全標頭 |
   | `-H "Sec-Fetch-Site: cross-site"` | 403 |
   | `-H "Origin: null"` | 403 |
   | 以同一 `-H "X-Forwarded-For: 203.0.113.9"` 連送 31 次 `-d "{}"`（迴圈） | 前 30 次 400，第 31 次 429、`Retry-After` 為 1–60 的整數 |
   | 改用 `X-Forwarded-For: 203.0.113.10` | 400（不同 IP 不受影響；同時證明本地 XFF 可偽造，與文件一致） |
   | `curl -s -i -X GET …/api/analyze`；`-X OPTIONS` | 405／204，帶 5 個安全標頭，無 `Access-Control-*` |

   dev server 終端機不應出現 `analyze failed`，也不應出現任何 IP。注意：dev 模式下 HMR 重新載入模組會清空限流狀態，連送 31 次時不要同時修改檔案。
5. **Playwright**：載入 `http://localhost:3000/`，console 無 error、無資源 404。另用 `page.evaluate` 在頁面內 `fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })`，預期 **400 而非 403**（證明真實瀏覽器的同源請求通過 Origin 檢查），並記錄該請求實際送出的 `Sec-Fetch-Site` 值。本 Feature 無 UI 互動變更，略過 `AGENTS.md` 第 4 項，於 Notes 註明。
6. **server-only 與 bundle**：`.next/static/` 搜尋不到 `rate_limited`、`forbidden`（作為 access-control 字串）與核心特有字串。
7. `git status` 只有本 Feature 的檔案；`.temp/` 未提交；舊專案無變更；dev server 已關閉。
8. **部署後（4.1，由使用者部署後一併驗證）**：對正式網址帶偽造的 `X-Forwarded-For` 連送，確認 Vercel 有覆寫（偽造不同 XFF 仍共用同一額度）；確認 `Host` 為正式網域、瀏覽器同源請求不被 403。結果記入 4.1。

## 已知風險

- **限流僅盡力而為**：多 instance 各自計數、冷啟動歸零、同 NAT 共用額度、10,000 筆上限可被大量真實 IP 擠掉。對「防止單一來源無意或低成本地狂打」有效，對分散式濫用無效。對外開放前評估外部儲存。
- **IP 信任依賴部署拓撲**：只有 Vercel 為最外層時 XFF 可信。若日後在前面加 CDN／代理，必須改讀該代理提供的標頭，否則所有人共用代理 IP 的額度（或可偽造）。本地 `next start` 對外時 XFF 可偽造。
- **IPv6**：一個使用者通常擁有整個 /64，可輕易換位址繞過每 IP 限制。2.1 不處理（非範圍），若觀察到濫用再改為 IPv6 以 /64 為鍵。
- **`Host` 與 `request.url` 在 Vercel 上的值**：期望 host 取 `Host` 標頭。若 Vercel 或自訂網域設定使函式內的 `Host` 不等於瀏覽器的 Origin host，舊版 Safari（只走規則 4）會被誤拒；新版瀏覽器走規則 1 不受影響。4.1 實測（Verification 第 8 步）；必要時改比 `x-forwarded-host`。另：若代理送 `Host: example.com:443` 而 `Origin` 為 `https://example.com`（URL 會去掉預設 port），規則 4 會誤拒；同樣只影響舊 Safari。
- **非瀏覽器請求放行**：curl／腳本不帶 Origin 即可呼叫，Origin 檢查對它們無效——這是方案 A 的已知性質（無 secret 的同源 API 無法區分「自家頁面」與「模仿的 client」），防線只有限流與請求驗證。日後升級 Turnstile／登入時只替換 `access-control.js`。
- **Vitest 的 `Request` 與受限標頭**：Fetch 規格把 `Origin`、`Host`、`Sec-*` 列為 forbidden header，但 Node（undici）的 `Request`／`Headers` 不過濾它們，預期可直接設定。若某版本被過濾，改對 `createAccessControl().checkAccess` 傳自訂物件 `{ headers: new Headers(...), url }`，並在測試註解說明。
- **測試間共用狀態**：同一測試檔共用預設限流實例；忘了 `resetAccessControlState()` 的新測試檔在超過 30 次 `POST` 後會出現看似無關的 429。已在設計決策 8 規定，並在 `access-control.js` 的 `resetAccessControlState` 註解提醒。
- **標頭兩處維護**：`RESPONSE_HEADERS` 與 `next.config.mjs` 各寫一份，由測試比對；改其中一處必須同步另一處。
- **dev 模式 HMR**：修改檔案會重新載入模組、清空限流狀態，手動驗證 429 時須留意。

## 未決事項

無阻擋開工的事項。以下是本規格已採用、可於 review 時推翻的預設，若使用者有不同意見請在開工前提出：

1. 無 `Origin` 也無 `Sec-Fetch-Site` 的請求**放行**（設計決策 4 規則 5）。替代方案是拒絕，但 curl 只要加一個偽造標頭即可通過，安全效益近乎零，反而讓測試與除錯變麻煩。
2. 限流數值 **每 IP 每 60 秒 30 次**（沿用舊專案），以模組常數設定、不開環境變數。
3. 429 body 只有 `{ error: "rate_limited" }`，秒數只放 `Retry-After` 標頭（與舊專案 body 不同）。
