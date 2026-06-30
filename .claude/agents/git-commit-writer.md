---
name: git-commit-writer
description: Generate and execute a Conventional Commits-formatted git commit. Invoke after implementation is complete and changes are ready to commit. Auto-detects openspec context from git status (archived changes) or active changes. No parameters needed.
model: haiku
tools: Read, Bash, Grep
---

Generate and execute a conventional git commit from staged changes.

Two modes:
- **With openspec context** (archive_path + change_id provided, or active change detected): adds `(<change-id>)` scope
- **Without openspec context**: derives message from `git diff --cached` only, no scope

**Execute immediately — no confirmation prompt.**

## Step 1 — Gather context (run in parallel)

### A. Code Changes (for writing the message)
```bash
git diff --cached --stat
git diff --cached
```

### B. OpenSpec Context (for determining the scope)
```bash
# Detect openspec changes from git working tree
if [ ! -d "openspec/changes" ]; then
  echo "NO_OPENSPEC"
else
  all_changes=$(git status --short | awk '{print $NF}')

  archived_changes=$(
    echo "$all_changes" \
    | grep '^openspec/changes/archive/' \
    | sed 's|^openspec/changes/archive/||' \
    | cut -d'/' -f1 \
    | sort -u
  )

  active_changes=$(
    echo "$all_changes" \
    | grep '^openspec/changes/' \
    | grep -v '^openspec/changes/archive/' \
    | sed 's|^openspec/changes/||' \
    | cut -d'/' -f1 \
    | sort -u
  )

  cli_active=""
  if [ -z "$archived_changes" ] && [ -z "$active_changes" ] && command -v openspec >/dev/null 2>&1; then
    cli_active=$(openspec list --json | grep -v "\[\]" || echo "")
  fi

  # Strip YYYY-MM-DD- prefix to get change_id
  archived_ids=$(echo "$archived_changes" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//')

  echo "archived_changes: $archived_changes"
  echo "archived_ids: $archived_ids"
  echo "active_changes: $active_changes"
  echo "cli_fallback: $cli_active"
fi
```

## Step 2 — Determine openspec context

Based on the detection script output from Step 1:

**Priority 1 — Archived changes** (`archived_changes` not empty):
- **Exactly one** → use it directly
  - `archive_path = openspec/changes/archive/<archived_changes>`
  - `change_id = <archived_ids>` (already stripped of date prefix)
  - Read `<archive_path>/proposal.md` — focus on **Why** and **What Changes**
- **Multiple** → ask the user to select one (show `archived_ids` list); use the chosen `archived_changes` entry to build `archive_path` and `archived_ids` entry as `change_id`

**Priority 2 — Active changes** (`archived_changes` empty, `active_changes` or `cli_fallback` not empty):
- **Exactly one** → read `openspec/changes/<name>/proposal.md`
- **Multiple** → use the first one from `active_changes` or the CLI output

**Priority 3 — No openspec context**:
- `NO_OPENSPEC` output or all lists empty → use git diff only, no scope

## Step 3 — Infer commit type

| Code nature | type |
|-------------|------|
| New feature / capability | `feat` |
| Bug fix | `fix` |
| Restructuring, no behavior change | `refactor` |
| Documentation only | `docs` |
| Scripts, config, tooling | `chore` |
| Tests | `test` |

## Step 4 — Format commit message

With openspec change:
```
<type>(<change-id>): <subject>

<body>
```

Without openspec change:
```
<type>: <subject>

<body>
```

- `<subject>`: imperative mood, max 72 chars, no trailing period
- `<body>`: 2–5 lines, what + why

## Step 5 — Execute

Include `Co-Authored-By` using **your own model name** (the model you are currently running on):

```bash
git commit -m "<message>

Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

Example: if you are Claude Haiku 4.5, write `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`.

On pre-commit hook failure: fix the issue and re-run `git commit`. Do NOT use `--no-verify`.

## Step 6 — Output

```
💾 Commit: <short-hash> <type>(<change-id>): <subject>
🤖 Executed by: git-commit-writer agent (haiku)
```
