---
name: feature
description: Manage current feature workflow - load, start, review, explain, test or complete
argument-hint: load|start|review|explain|test|complete
---

## Context

Read the current feature from:
@context/current-feature.md

並遵守 `AGENTS.md`（特別是「驗證」、「版本控制」與「對外動作」三節）。

## File Structure

current-feature.md has these sections:

- `# Current Feature` - H1 heading with feature name when active
- `## Status` - Not Started | In Progress | Complete
- `## Goals` - Bullet points of what success looks like
- `## Notes` - Additional context, constraints, baseline and verification results
- `## History` - Completed features (append only)

## Task

Execute the requested action: $ARGUMENTS

---

### If action is "load":

1. Check $ARGUMENTS (after "load"):
   - Looks like a filename (single word, no spaces): read `context/features/{name}.md`
     (也接受編號，如 `1-2` → 比對 `context/features/1-2-*.md`)
   - Multiple words: use as inline feature description, generate goals
   - Empty: error - "load" requires a spec filename or feature description
2. Update current-feature.md:
   - H1 includes feature name (e.g., `# Current Feature: 1.2 Route Handler`)
   - Write goals as bullet points under ## Goals
   - Write constraints / context under ## Notes
   - Set Status to "Not Started"
3. Confirm spec loaded and show the feature summary

---

### If action is "start":

1. Read current-feature.md - verify Goals are populated; if empty, error: "Run /feature load first"
2. Set Status to "In Progress"
3. Create and checkout the feature branch (derive name from H1 heading, `feature-<name>`)
4. **Baseline first**: 在動手前先記錄基準，寫入 Notes
   - `npm run build` 是否成功（專案已有 package.json 時）
   - 與本 Feature 相關的 baseline 數值（核心 Feature：步頻／觸地時間／總分與 landmarks 樣本輸出）
5. List the goals, then implement them one by one; maintain a todo list
6. After implementation, verify in this order（細節見 AGENTS.md「驗證」）:
   a. `npm run build`（及 lint）
   b. `npm test`，並與 baseline 逐值比對
   c. 有 UI／API 變更：dev server＋Playwright 無 console error、無資源 404；API 狀態碼
   d. 有互動變更：切 Profile、播放／暫停／拖曳骨架動畫、選擇影片
7. 若 2-3 次修正仍失敗，停止並說明問題，不要亂試
8. 規格含「對外動作」（部署、push、設定環境變數）時，只準備程式與文件，由使用者親自操作

---

### If action is "review":

1. Read current-feature.md to understand the goals
2. Review all changes (`git diff master`)
3. Check for:
   - ✅ Goals met
   - ❌ Goals missing or incomplete
   - ⚠️ 行為是否被改變（核心搬遷必須零行為變更）、核心模組是否被誤引入瀏覽器 bundle、存取控制是否被繞過
   - 🚫 Scope creep
4. Final conclusion: Ready to complete or needs changes
5. Write the report in Traditional Chinese; keep paths, identifiers, commands unchanged

---

### If action is "explain":

1. Read current-feature.md
2. Run `git diff master --name-only`
3. For each file: path + 1-2 sentence explanation (new / modified), key functions
4. End with a brief summary of how the pieces fit together（含 Client／Server 邊界與 import 關係）

---

### If action is "test":

重跑 `start` 步驟 6 的完整驗證，並回報與 baseline 的差異。專案尚無 `package.json` 時，說明哪些驗證項目不適用。

---

### If action is "complete":

1. 確認驗證已通過；否則停止
2. Stage changes and commit with a conventional commit message
3. Switch to master and merge the feature branch (**不 push**)
4. Delete the local feature branch
5. Reset current-feature.md and apply the History STAY vs MOVE rule:
   - H1 back to `# Current Feature`, clear Goals and Notes (keep placeholder comments)
   - First move every History entry whose date is NOT today into `context/history/project-history.md` (append at bottom, oldest first; create the file if missing)
   - Then append this feature's summary as a new entry (today's date) at the END of History
6. Update `docs/planning/epics-and-features.md`: 將該 Feature 狀態改為 `done`
7. Commit the reset: `Complete [feature]`
8. 回報完成並提醒「尚未 push」，由使用者決定

---

If no action provided, explain the available options: load, start, review, explain, test, complete
