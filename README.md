# AI 跑姿生物力學與骨架循環分析系統

單一 Next.js 專案、單一 Vercel 部署（目標架構）：MediaPipe 留在瀏覽器擷取 landmarks，核心演算法只存在於 server-only 模組，Client 只負責擷取、呼叫 `/api/analyze` 與渲染結果。3.7 起瀏覽器不再帶舊核心，邊界見 [docs/client-server-boundary.md](docs/client-server-boundary.md)。

- 版本：V4.0（集中於 `lib/config.js` 的 `APP_CONFIG`，發版時同步本檔）

## 目前狀態

Epic 0–2、3.1–3.9、4.1、5.1、5.3、5.4 完成（5.4：手機版核心一／二各自一屏放得下、不需捲動，設定項收進「⚙」底部彈出面板；5.3：手機版三區殼層——Logo 2 行、常駐操作區〔身高／步幅／步頻／配速、目前分析影片、上傳／JSON、核心一｜核心二｜分析切換，3 行 sticky〕、主題區一次顯示一個核心、步幅「改回 AI 自動」彈出面板，以 `public/js/mobile-shell.js` 搬移既有節點（ID 不變），桌面與平板不變、無新依賴；5.1：手機版 UI——舊頁面 RWD、觸控目標 ≥ 44px、骨架畫布觸控拖曳換格、觸控裝置「拍攝影片」按鈕、畫布依 devicePixelRatio 清晰化、無新依賴，實機待驗清單見 [規格第 9 節](context/features/5-1-mobile-ui.md)；4.1：新增 `vercel.json`（區域 `hnd1`）、兩個 API route 的 `maxDuration`、`npm run smoke`（對本地或部署網址跑同一套 HTTP 檢查）與 [docs/deployment.md](docs/deployment.md)，不需任何環境變數；3.8：「📄 匯出報告」在瀏覽器組出報告頁並以列印／另存 PDF 輸出，只讀 derive 快取與唯讀相位、不發請求；衍生值更新中或失敗時拒絕匯出；3.7：Client 改讀 `/api/derive`（載入、切換 profile、機位、身高、重設自動、手動步頻〔debounce 400 ms〕、擷取完成、匯入時呼叫），移除暫時核心目錄與 `VERCEL` 部署防線，匯入壞檔（步頻不在 (0, 400] 或數值絕對值 > 1000）改為拒絕並提示；3.6：契約升 1.1.0（`metrics.gct`），新增 `POST /api/derive`（Server 端重算衍生值）；3.5：內建 profile 靜態資料與 101 幀烘焙關鍵幀、模擬擷取用的合成 landmarks 放在 `lib/profiles/`；修改 `lib/profiles/builtin.js` 後須執行 `npm run bake:profiles`（重新烘焙並同步到 `public/modules/`），測試會偵測過期；UI 不再有本地運動學退回路徑，缺關鍵幀時不顯示骨架並提示；3.4：角度擷取與骨架運動學等共用模組改為 `lib/player/`、`lib/landmarks/` 單一來源，經 `npm run sync:legacy` 同步到 `public/modules/` 並以 `window.RFA` 橋接；修改這兩個目錄後須重新同步）；`/` 導向舊 Client（`/index.html`，檔案在 `public/` 根目錄，`npm run dev` 後開 `http://localhost:3000/index.html`）。3.3 起，影片擷取完成時會把 landmarks 上傳到 `/api/analyze`（不送 `profileName`）；無影片的模擬擷取同樣上傳（預先烘焙的合成 landmarks）到 `/api/analyze`（3.5 起）；JSON 匯入、手動調整與遙測改由 `/api/derive` 計算（3.7 起）。**尚未部署**：建立 Vercel 專案與部署由使用者依 [docs/deployment.md](docs/deployment.md) 操作。路線圖見 [docs/planning/epics-and-features.md](docs/planning/epics-and-features.md)。

## 開發

需要 Node 24.x。

```bash
npm install
npm run dev      # 開發伺服器
npm run build
npm run lint
npm test
REQUIRE_BASELINE=1 npm test   # 缺 baseline 樣本即失敗（樣本放 .temp/json/，不提交）
npm start                     # 先 npm run build；production 模式
npm run smoke                 # 另一個終端機，對 npm start 的服務跑 HTTP 檢查（--base-url 可指定部署網址）
```

## 文件

- [docs/server-api.md](docs/server-api.md)：`POST /api/analyze`、`POST /api/derive` 與存取控制
- [docs/analysis-json-contract.md](docs/analysis-json-contract.md)：分析結果 JSON 契約
- [docs/privacy.md](docs/privacy.md)：隱私說明
- [docs/deployment.md](docs/deployment.md)：部署到 Vercel 的操作清單與驗證
- [docs/client-server-boundary.md](docs/client-server-boundary.md)：Client／Server 邊界與決策
- [docs/planning/epics-and-features.md](docs/planning/epics-and-features.md)：路線圖
- [AGENTS.md](AGENTS.md)：協作規則

## 隱私摘要

3.3 起影片擷取只上傳 landmarks（不是影片，最多 1500 幀）、Server 不儲存請求內容、不寫 log（唯一例外是固定字串 `analyze failed`），IP 只在記憶體中用於限流。詳見 [docs/privacy.md](docs/privacy.md)。

## 存取控制摘要

同源、無 API Key；每 IP 每 60 秒 30 次，**僅盡力而為**（serverless 多 instance，不是嚴格配額）。詳見 [docs/server-api.md](docs/server-api.md#存取控制)。
