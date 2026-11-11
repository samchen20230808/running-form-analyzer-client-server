# Feature 0.2 — Next.js 骨架與 baseline

## Status

`ready-for-dev`

## Epic

Epic 0 — 專案啟動與工作流程

## Objective

建立可建置的 Next.js 專案骨架與測試基礎設施，並把舊專案的 baseline 樣本納入，讓 Epic 1 能「搬一個、比一個」。

## Goals

- 專案根目錄建立 Next.js（App Router、JavaScript）：`package.json`（`engines.node` 24.x）、`next.config.mjs`、`app/layout.js`、`app/page.js`（佔位頁）。
- 加入 Vitest：`npm test` 可執行；有一個冒煙測試。
- 建立 `lib/config.js`（`APP_CONFIG`，由舊專案 `js/config.js` 搬入並改成 ES module；`version` 等值保持一致，不含 DOM 存取）。
- 建立 baseline 機制：
  - 樣本來源為舊專案 `.temp/json/`（walk summary 匯出、3 份 `landmarks-*.json` 與 `client-*.json`）。
  - 複製到本專案 `.temp/json/`（已 gitignore，不提交）。**複製前先列出檔案清單讓使用者確認，且確認內容不含個資**（`profileName` 可能含檔名）。
  - 寫一個 `tests/baseline.test.js` 骨架：樣本不存在時 `skip` 並說明，存在時載入並驗證檔案格式（不跑核心，核心在 1.1）。
- `npm run dev`／`npm run build`／`npm test` 皆成功。

## 待決定事項（開工前確認）

1. 是否提交去識別化的 fixtures？（建議：否，維持 `.temp/` 不提交；CI 之類的需求出現再議。）
2. 是否加 ESLint？（建議：用 `next lint` 預設設定，不另加規則。）
3. Next.js 與 React 版本：沿用舊 `server/package.json`（next 16.4.6、react 19.3.1）。

## Out of scope

- 核心演算法搬遷（Epic 1）、API（1.3）、存取控制（Epic 2）、Client UI（Epic 3）。

## Verification

- `npm run build`、`npm test` 通過。
- `npm run dev` 開啟首頁佔位頁，Playwright 無 console error。
- `.temp/` 未被提交（`git status` 乾淨）。
