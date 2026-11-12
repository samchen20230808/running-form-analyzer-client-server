# 部署到 Vercel（Feature 4.1）

本文件是「使用者照著做就能部署」的操作清單。**建立 Vercel 專案、連結 GitHub、`git push`、部署都由使用者親自操作**；agent 只準備設定、驗證腳本與文件。本文件不放任何 secret、token 或帳號資訊，網址以 `https://<專案>.vercel.app` 佔位。

## 1. 概要

- 單一 Vercel 專案：頁面與 `public/` 靜態檔由 CDN 提供；`/api/analyze`、`/api/derive` 是 Node.js Function。
- 區域：`vercel.json` 固定 `hnd1`（東京）。Node 版本：`package.json` 的 `engines` 為 `24.x`。
- Function 設定：`runtime = "nodejs"`、`maxDuration 10 秒`（寫在兩個 route 檔，本地 3000 幀實測最大約 0.2 秒）。記憶體不設定，用平台預設。
- 沒有資料庫、沒有外部服務，**不需要任何環境變數**（第 6 節）。

## 2. 前提

- 3.7 已完成（暫時核心已移除），本地 `npm run build`、`npm test` 通過。
- GitHub repo 內已有本專案程式（Vercel 匯入空 repo 時，Framework Preset 會顯示 Other，這是因為偵測不到 Next.js，不是設定問題）。
- 方案：以 Hobby 撰寫。Hobby 依 Vercel 條款限非商業用途；Pro 差異只在記憶體可調（Hobby 固定 2 GB）、`maxDuration` 上限與多區域，本專案都不需要。
- 已知尚未處理（另開 Feature）：頁面沒有安全標頭／CSP；Tailwind CDN、Google Fonts、jsdelivr MediaPipe 未釘版。公開部署前請自行評估這兩項（見 `privacy.md`）。

## 3. 部署前本地檢查

```
npm ci
npm run lint
REQUIRE_BASELINE=1 npm test
npm run build
npm start                 # 預設 http://localhost:3000；埠被占用時 npm start -- -p 3100
npm run smoke             # 另一個終端機；埠不同時加 -- --base-url http://localhost:3100
```

`npm run smoke` 全部 PASS（exit 0）才繼續。`INFO` 行是說明，不算失敗。

## 4. 建立 Vercel 專案（使用者操作清單）

1. Vercel Dashboard → Add New → Project → Import 本 GitHub repo。
2. Application Preset：**Next.js**（repo 有程式時會自動偵測；顯示 Other 代表 repo 裡沒有程式）。
3. Root Directory：**`./`（repo 根目錄，不要改）**。Build／Install／Output 設定不覆寫。
4. Environment Variables：**不需新增任何變數**。
5. Deploy。
6. Settings → General → Node.js Version：選 24.x（與 `engines` 一致，否則 build log 會有不一致警告）。
7. Settings → Functions：確認 Function Region 顯示 `hnd1`（由 `vercel.json` 決定，不要在此改）；Fluid compute 維持預設。
8. **不要啟用** Web Analytics、Speed Insights（會加入第三方追蹤，與 `privacy.md` 衝突；要啟用須先改隱私文件）。
9. Deployment Protection 預設會保護 Preview，也可能保護帶 hash 的各次部署專屬網址（未登入回 401 或導向登入），維持預設；smoke 一律對 Production 網域（`<專案>.vercel.app` 或自訂網域）執行，不要用帶 hash 的部署網址。

## 5. 部署後驗證

```
npm run smoke -- --base-url https://<專案>.vercel.app --expect-region hnd1
# 等 60 秒（讓上一輪額度過期）後：
npm run smoke -- --base-url https://<專案>.vercel.app --rate-limit
```

- 第一行預設檢查最多送 9 次會計入限流的 POST；`--rate-limit` 會再用掉本機 IP 約 60 秒的 API 額度。
- A13（約 5 MB）在 Vercel 上預期由「平台」回 413（非本 API 格式），腳本會標示來源，兩者都算通過；若平台在上傳中途就關閉連線，腳本會改報 INFO（無法拿到 response），可用 `curl -i` 手動確認。
- `--expect-region` 只比對 `x-vercel-id`（格式 `<邊緣 PoP>::<Function 區域>::<id>`）中的 Function 區域，不是邊緣 PoP。
- 只有 `localhost`、`127.0.0.1`、`[::1]` 被視為本地；其他網址（含區網 IP）一律按部署環境判斷。
- R2（偽造 `X-Forwarded-For`）：偽造後仍 429 → PASS；回 200 時會再送一次不帶 XFF 的對照請求，對照仍 429 才判 FAIL（IP 可被偽造、限流可被繞過，請回報，另開 `fix-` 處理），對照也是 200 則只報 INFO（可能換了 instance），請重跑。
- R1 在部署環境未觸發 429 只算 INFO（可能分散在多個 instance，見第 7 節）。

瀏覽器手動檢查：開 `/`（應落在 `/index.html`）；DevTools console 無 error、Network 無 4xx（第三方 CDN 除外）；選影片擷取後出現一次 `POST /api/analyze` 200；切換 Profile、播放骨架、拖入影片、匯入 JSON、手動步頻、匯出報告都可用。

把 smoke 輸出（可去掉網址）交給 agent，填入第 10 節。

## 6. 環境變數

本專案目前**不需要任何環境變數**：

- Origin 檢查拿請求的 `Host` 比對，沒有允許清單，自動適用 `*.vercel.app` 與日後的自訂網域。
- `app/`、`lib/` 不讀 `process.env`，由 `tests/privacy-docs.test.js` 把關；`scripts/smoke-test.mjs` 也不讀環境變數。
- Vercel 自動注入的系統變數（`VERCEL`、`VERCEL_ENV` 等）程式不讀取。

日後若新增（例如 Turnstile secret）：只在 Vercel Dashboard 設定、依環境分開，不進 git（`.env*` 已 gitignore）、不貼進對話。

## 7. 平台限制與如實說明

- **請求大小**：Client 最多 1500 幀（約 3.5 MB）< API 上限 4 MB < Vercel Function 上限 4.5 MB。超過 4.5 MB 由平台直接回 413（`FUNCTION_PAYLOAD_TOO_LARGE`），格式不同、不帶本 API 的安全標頭、不計入限流。
- **執行時間**：`maxDuration 10 秒`，超過平台回 504。Hobby 上限為 300 秒，不是瓶頸。
- **限流**：每個 instance 的記憶體計數，僅盡力而為。Fluid compute 讓同一 instance 處理多個並行請求，計數較集中，但流量上升時仍會擴到多個 instance、各自計數；冷啟動、重新部署、instance 回收都會歸零；同一 NAT 後的使用者共用額度。部署後 smoke 的 429 只代表「當下打到的那個 instance」，不能證明全域配額。要嚴格配額須改外部儲存（另開 Feature）。
- **IP**：取 `x-forwarded-for` 第一段，只在 Vercel 為最外層時可信。**不要在 Vercel 前面再加會改寫 XFF 的 proxy**，也不要把 `next start` 直接暴露在網路上。
- **平台 log**：Vercel 會記錄請求 metadata 與 runtime log（本程式只有固定字串 `analyze failed`、`derive failed`，不記錄請求內容）。保留期依方案，以 Vercel 官方說明為準。
- **頁面**：目前沒有安全標頭／CSP，第三方資源未釘版（已知，另開 Feature）。

以上平台數字（4.5 MB、`maxDuration` 上限、記憶體）查證自 Vercel 官方文件（Functions Limits，2026-11-12 查閱）；平台可能調整，以官方為準。

## 8. 自訂網域（選用）

Dashboard → Domains 新增。同源檢查依 `Host`，不需改程式；加網域後以新網址重跑第 5 節 smoke。

## 9. 更新與回滾

- push 到預設分支觸發 Production 部署（使用者操作）。
- 部署後發現問題：Dashboard 的 Instant Rollback，或 Promote 先前的部署；回滾後重跑 smoke。

## 10. 部署實測紀錄

| 日期 | commit | smoke 結果 | A13 由誰回 413 | R2（XFF） | `x-vercel-id` 區域 | analyze 耗時 |
| ---- | ------ | ---------- | -------------- | --------- | ------------------ | ------------ |
| 尚未部署 | — | — | — | — | — | — |

## 11. 疑難排解

| 現象 | 原因與處理 |
| ---- | ---------- |
| Preset 顯示 Other | repo 是空的或根目錄沒有 `package.json`；先 push 程式 |
| 401 或導向登入 | Preview 的 Deployment Protection；改用 Production 網址 |
| 403 | 瀏覽器跨站請求，或 `Host` 與 `Origin` 不符 |
| 413 且不是 JSON | 超過平台 4.5 MB 上限 |
| smoke 的 A3／A12 標頭比對失敗，值像 `no-store, no-store` | 平台層與程式各加了一次標頭；先用 `curl -i` 確認，必要時調整比對方式 |
| 429 | 等 `Retry-After` 秒數後重試 |
| 504 | 超過 `maxDuration` |
| build 失敗 | 先本地 `npm run build`；確認 Node 版本 24.x |
