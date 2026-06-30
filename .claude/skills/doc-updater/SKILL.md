---
name: doc-updater
description: >
  Update docs/, README.md, and AGENTS.md based on current changes.
  If uncommitted changes exist, scans those and updates docs in-place (Mode A —
  doc changes join the upcoming commit). If working tree is clean, scans last N
  commits (asks user, default 1) and leaves doc changes in working tree for
  review (Mode B). Never commits automatically.
license: MIT
compatibility: Requires git.
metadata:
  author: wkchen
  version: "1.0"
---

# Doc Updater

自動分析當前變更或最近的 commit，並同步更新 `docs/`、`README.md`、`AGENTS.md` 等說明文件。

不依賴 OpenSpec 工作流程，適用於所有類型的變更。根據 git 狀態自動選擇運作模式：

- **Mode A**（有未 commit 的變更）：掃描當前變更，文件更新加入工作區，與 feature 一起 commit
- **Mode B**（工作區乾淨）：掃描最近 N 個 commit，建立獨立的 `docs:` commit

**立即執行，不需確認。**

---

## Step 1 — Detect mode

```bash
git status --short
```

- **有任何輸出**（有 staged 或 unstaged 檔案）→ **Mode A**
- **無輸出**（工作區乾淨）→ **Mode B**

---

## Mode A — 有未 commit 的變更

### Step A1 — Read the diff

```bash
git diff HEAD
```

同時讀取 staged 和 unstaged 的所有變更。

### Step A2 — Analyze diff for documentation impact

根據 diff 套用決策表：

| 偵測到的變更 | 更新目標 |
|------------|---------|
| 新增 `.claude/agents/*.md` 或 `template/common/.claude/agents/*.md` | `AGENTS.md`（新增 agent 項目） |
| 新增 `.claude/skills/*/SKILL.md` 或 `template/common/skills/*/` | `AGENTS.md`（新增 skill 參照） |
| 新增 `template/<profile>/` 或修改 `install.sh` | `docs/template-profiles.md`、`README.md` |
| 修改 `scripts/workflow/` | `docs/workflow/guide.md`、`README.md` |
| 新增 env var 或新外部相依套件 | `README.md`（相依套件區段） |
| 重大新功能或新使用者可見能力 | `README.md` 及/或 `docs/<feature>.md` |
| 純內部實作、無使用者可見影響 | 無需更新 → 輸出原因並停止 |

### Step A3 — Read target docs, then edit

對每個目標文件：
- **先完整讀取，再編輯**
- **只改相關 section**，不重寫無關段落
- **AGENTS.md**：完全遵循現有 `### <name>` 項目格式（位置/用途/特性/觸發方式）
- **README.md**：保持繁體中文；只新增表格列或清單項目，不改結構
- **docs/*.md**：比對現有語氣與格式；在邏輯位置新增 section

### Step A4 — Output（不建立 commit）

成功時：
```
📝 Docs updated (Mode A — uncommitted changes):
  - <file>   — <what changed>

ℹ️  Doc changes are in your working tree. They will be included in your next commit.
```

無需更新時：
```
⏭️  No doc update needed
Reason: <reason>
```

---

## Mode B — 工作區乾淨（post-commit）

### Step B1 — Ask how many commits to scan

使用 AskUserQuestion 詢問：
> "要掃描最近幾個 commit 來更新文件？（1-10，預設 1）"

將答案作為 N 使用（若接受預設則 N=1）。

### Step B2 — Read the commits

```bash
git log -N --format="%H %s"
git diff HEAD~N HEAD
```

### Step B3 — Skip check

若以下任一條件符合，輸出 skip 訊息並停止：
- 所有 N 個 commits 的 subject 都以 `docs:` 開頭 → 已是 docs commit，避免無限循環
- 所有 N 個 commits 的 subject 都以 `test:` 或 `style:` 開頭 → 無文件影響

### Step B4 — Analyze and edit（與 Mode A 的 Step A2 & A3 相同邏輯）

套用相同的決策表和編輯規則。

### Step B5 — Confirm changes

```bash
git diff --stat docs/ README.md AGENTS.md
```

### Step B6 — Output

成功時：
```
📝 Docs updated (Mode B — scanned last N commit(s)):
  - <file>   — <what changed>

ℹ️  Doc changes are in your working tree. Review and commit when ready.
```

無需更新時：
```
⏭️  No doc update needed
Reason: <reason>
```
