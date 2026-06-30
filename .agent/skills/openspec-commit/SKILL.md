---
name: openspec-commit
description: >
  Archive the current openspec change, update docs/ documentation, and create
  a conventional git commit. Use at the end of feature development inside a
  git worktree (after /opsx:apply), before running wt-done to merge to main.
license: MIT
compatibility: Requires openspec CLI and git.
metadata:
  author: wkchen
  version: "1.2"
---

# OpenSpec Commit

Complete the feature development cycle inside a git worktree:
1. Archive the openspec change (full flow, including sync decision)
2. Update `docs/` files relevant to the feature
3. Create a conventional git commit

**Prerequisite:** `/opsx:apply` is complete and the feature is implemented.

---

## Step 1 — Find the active change

Run `openspec list --json` to find active changes.

- **Exactly one active change** → use it directly, no prompt needed
- **Multiple active changes** → use AskUserQuestion to let the user select
- **No active changes** → display WARNING:
  ```
  ⚠️ No active openspec change found.
  Archive step will be skipped.
  Continue with docs update + commit only?
  ```
  If user confirms: skip to Step 3 and ask user to describe the feature.
  If user cancels: stop.

---

## Step 2 — Run opsx:archive (full flow)

Use the **Skill tool** to invoke `openspec-archive-change` for the identified change.

```
Skill tool → openspec-archive-change → <change-name>
```

**IMPORTANT:** Wait for the archive to **fully complete**, including the sync
decision prompt (Sync now / Archive without syncing). Both choices are valid
completions — do NOT skip or shortcut the sync prompt.

After archive completes, capture:
- The change name
- Whether specs were synced
- The archive directory path (will be `openspec/changes/archive/YYYY-MM-DD-<name>/`)

---

## Step 3 — Read archived change for feature context

Find the most recently modified directory under `openspec/changes/archive/`:

```bash
ls -t openspec/changes/archive/ | head -1
```

Read the following files:
- `openspec/changes/archive/<archive-dir>/proposal.md` — focus on **Why** and **What Changes**
- `openspec/changes/archive/<archive-dir>/specs/**/*.md` — focus on capability scope

Display to the user:
```
📦 Reading context from: openspec/changes/archive/<archive-dir>/
```

---

## Step 4 — Determine and update docs/

Based on the archived proposal and specs, infer which documentation files need updating.

**Discovery process:**

1. Scan the `docs/` directory to understand what documentation exists:
   ```bash
   ls docs/
   ```

2. Read the proposal's **What Changes** and **Why** sections to identify:
   - Which modules, components, or subsystems are affected
   - Whether this is a new capability or a modification of existing behavior

3. Match affected areas to existing doc files by content relevance, not by name convention. For each candidate doc file, read its heading structure (first ~20 lines) to confirm it covers the affected area.

4. Also consider `README.md` if the change introduces a new capability visible to end users.

**Decision rule:**

- Include a doc file only if the change **directly affects** what that file documents
- If no existing doc file covers the affected area, note it but do not create new docs unless the user requests it
- If the change only affects internal tooling or skills, `README.md` is usually not needed

**Before updating:**

Display the planned update list and ask for confirmation:
```
📝 Documents to update:
  - docs/<file>.md  (<reason>)
  - README.md       (<reason>)
Skip any? (type file names or 'none')
```

**Update rules:**
- Only modify sections **directly related** to this feature
- Do NOT rewrite unrelated sections
- If a relevant section doesn't exist, append it at an appropriate location
- If no update is needed for a file, skip and briefly explain why

---

## Step 5 — Execute git commit via git-commit-writer

**In Claude Code:** Use the `git-commit-writer` agent (defined in `.claude/agents/git-commit-writer.md`, runs on Haiku automatically):

```
Use the git-commit-writer agent.
```

**In other tools (Antigravity):** Invoke the `git-commit-writer` skill directly.

The agent/skill will automatically detect the archived change from `git status` output — no parameters needed.

Capture the commit hash output for Step 6.

---

## Step 6 — Display completion summary

```
✅ Feature committed

📦 Archive:  openspec/changes/archive/YYYY-MM-DD-<name>/
             Specs: ✓ Synced  (or: Sync skipped)

📝 Docs updated:
   - docs/feature.md — updated section: fetch_agent_list.py usage
   - README.md   — updated: 支援的資料來源

💾 Commit:  <short-hash> <type>(<change-id>): <subject>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next step → merge to main:

  wt-done <feature-name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Archive fails | Stop and display error; do not proceed to docs/commit |
| Archive dir not found after archive | Warn user, ask if they want to describe feature manually |
| git commit fails (pre-commit hook) | Fix the issue and re-run `git commit` (do NOT use `--no-verify`) |
| docs update conflict with existing content | Show the conflict and ask user how to resolve |
