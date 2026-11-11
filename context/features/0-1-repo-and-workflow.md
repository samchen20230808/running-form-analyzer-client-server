# Feature 0.1 — 建立 repo 與工作流程

## Status

`done`

## Epic

Epic 0 — 專案啟動與工作流程

## Objective

建立新專案的版本控制與協作流程，使後續 Feature 可用 `/feature load`、`start`、`review`、`complete` 推進。

## Scope

- `git init`，預設分支 `master`。
- `AGENTS.md`、`CLAUDE.md`（`@AGENTS.md`）、`.gitignore`。
- feature skill：`.agents/skills/feature/SKILL.md` 為本體，`.claude/skills/feature/SKILL.md` 轉指。驗證段改為 `npm run build`／`npm test`／Playwright／baseline 逐值比對。
- `context/current-feature.md`、`context/features/`、`docs/planning/epics-and-features.md`。

## Out of scope

- 任何 Next.js 程式碼與 `package.json`（0.2）。
- 修改舊專案。

## Verification

- 檔案齊全、`git log` 有初始提交、工作樹乾淨。
- `/feature load 0-2` 能讀到下一個規格。

## 備註

此 Feature 是啟動檔案，直接在 `master` 提交；之後的 Feature 走 `feature-<名稱>` branch。
