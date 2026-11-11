# AI 跑姿生物力學與骨架循環分析系統

單一 Next.js 專案、單一 Vercel 部署（目標架構）：MediaPipe 留在瀏覽器擷取 landmarks，核心演算法只存在於 server-only 模組，Client 只負責擷取、呼叫 `/api/analyze` 與渲染結果。**3.2–3.3 過渡期例外**：瀏覽器暫時帶舊核心（`public/legacy/temp-core/`），見 [docs/client-server-boundary.md](docs/client-server-boundary.md)。

- 版本：V3.29（集中於 `lib/config.js` 的 `APP_CONFIG`，發版時同步本檔）

## 目前狀態

Epic 0–2、3.1、3.2 完成；`/` 導向原樣搬入的舊 Client（`/legacy/index.html`，含暫時核心，**3.3 完成前不可部署**），尚未呼叫 API（3.3）、尚未部署（Epic 4）。路線圖見 [docs/planning/epics-and-features.md](docs/planning/epics-and-features.md)。

## 開發

需要 Node 24.x。

```bash
npm install
npm run dev      # 開發伺服器
npm run build
npm run lint
npm test
REQUIRE_BASELINE=1 npm test   # 缺 baseline 樣本即失敗（樣本放 .temp/json/，不提交）
```

## 文件

- [docs/server-api.md](docs/server-api.md)：`POST /api/analyze` 與存取控制
- [docs/analysis-json-contract.md](docs/analysis-json-contract.md)：分析結果 JSON 契約
- [docs/privacy.md](docs/privacy.md)：隱私說明
- [docs/client-server-boundary.md](docs/client-server-boundary.md)：Client／Server 邊界與決策
- [docs/planning/epics-and-features.md](docs/planning/epics-and-features.md)：路線圖
- [AGENTS.md](AGENTS.md)：協作規則

## 隱私摘要

3.3 起只上傳 landmarks（不是影片；3.2 不上傳任何資料）、Server 不儲存請求內容、不寫 log（唯一例外是固定字串 `analyze failed`），IP 只在記憶體中用於限流。詳見 [docs/privacy.md](docs/privacy.md)。

## 存取控制摘要

同源、無 API Key；每 IP 每 60 秒 30 次，**僅盡力而為**（serverless 多 instance，不是嚴格配額）。詳見 [docs/server-api.md](docs/server-api.md#存取控制)。
