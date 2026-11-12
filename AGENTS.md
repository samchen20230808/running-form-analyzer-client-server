# Running Form Analyzer（Next.js 單一部署版）— 專案協作規則

## 語言與溝通

- 與使用者溝通、介面文案與新增文件一律使用繁體中文；程式識別字、套件名稱與既有英文技術術語除外。
- 先說明結果與影響，再簡潔交代必要的驗證資訊。

## 專案背景

- 本專案是 `D:\MyWeb\Running form analyzer`（以下稱「舊專案」）的後繼：把「靜態 Client＋獨立 Next.js Server」合併成**單一 Next.js 專案、單一 Vercel 部署**。
- 舊專案作為參考**原樣保留，不修改**。需要時用唯讀方式查閱其程式、`docs/analysis-json-contract.md`、`docs/server-api.md` 與 `context/features/`。
- 目標：MediaPipe 留在瀏覽器；核心演算法只存在於 server-only 模組，不被打包進瀏覽器；Client 只負責擷取 landmarks、呼叫 `/api/analyze`／`/api/derive`、渲染結果（評分、GCT、相位計時、步幅、骨架模型只在 Server；角度擷取與閘門、關鍵幀取樣與正向運動學等共用純函式在 `lib/player/`、`lib/landmarks/`，內建 profile 輸出在 `lib/profiles/`，經 `npm run sync:legacy` 同步到 `public/modules/`）。

## 專案技術範圍

- Next.js（App Router、**JavaScript**，不用 TypeScript），Node runtime。核心演算法用 ES module，**不使用 `node:vm`**。
- 測試用 **Vitest**；核心的零行為變更以「與 baseline 逐值一致」驗證。
- 優先延續既有架構與命名慣例，避免未被需求要求的重構或新依賴。新增依賴須先向使用者說明。

## 存取控制（已決定）

- 瀏覽器與 API **同源**，不把長效 API Key 放在前端。
- 起點為「方案 A」：Origin／`Sec-Fetch-Site` 檢查、每 IP 記憶體式限流、請求大小與範圍驗證、安全標頭、無 CORS。
- 存取控制封裝為單一模組，日後升級（Turnstile、登入）只換該模組。限流在 serverless 僅盡力而為，文件須如實記載。

## 文件優先順序

1. `context/features/` 的功能規格
2. `docs/planning/epics-and-features.md`（Epic／Feature 路線圖）
3. `README.md` 與 `docs/` 其餘文件
4. 此檔案與既有程式碼

## 驗證

每個 Feature 完成前依序驗證，並把結果寫入 `context/current-feature.md` 的 Notes：

1. `npm run build` 成功，`npm run lint`（若已設定）無錯誤。
2. `npm test`（Vitest）通過；核心相關 Feature 須與 baseline 逐值一致（基準：walk 樣本步頻 103／觸地 361ms／總分 96，及三份 landmarks 樣本）。
3. 有 UI 或 API 變更時，啟動 `npm run dev`，用 Playwright 載入頁面：無 console error、無資源 404；API 用 `curl` 或測試驗證狀態碼。
4. 有互動變更時：切換 Profile、播放骨架動畫、選擇／拖入影片。

`.temp/` 已被 gitignore；來自舊專案的樣本檔放此處，不可提交（若 0.2 決定提交去識別化 fixtures，以該規格為準）。

## 版本控制

- 一個 Feature 一個 branch，命名 `feature-<名稱>` 或 `fix-<名稱>`；預設分支為 `main`。
- 使用 conventional commit（feat:、fix:、refactor:、docs:、chore:）。
- 驗證通過前不 commit。
- `/feature complete` 會 commit 並合併回預設分支，但**不會 push**；push 須使用者明確要求。
- 不執行破壞性 Git 指令（如 `git reset --hard`），除非使用者明確要求。
- 保留使用者既有的未提交變更。

## 對外動作

- 建立 Vercel 專案、設定環境變數、`vercel deploy`、`git push`、連結 GitHub 一律由使用者親自操作；agent 只改程式與文件並做本地驗證。
- 真實的 key／secret 不進 git、不進對話紀錄。
- 不讀取 `.env*` 內容。

## 版本設定

- 版本號、系統名稱等集中於 `APP_CONFIG`；發版時才更新，並同步 `README.md`。`public/js/config.js` 另有一份 `APP_CONFIG`，發版時須同步（版本號由 `tests/legacy-client.test.js` 把關）。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
