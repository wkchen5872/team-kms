---
name: mutation-check
description: >
  Diff-based mutation testing audit for AI agent projects. Measures whether the
  test suite actually catches bugs (not just line coverage) on changed files.
  Python via mutmut, TS/JS via Stryker. Advisory only — never a commit gate.
license: MIT
compatibility: "Requires bash, git. Python: mutmut v3. TS/JS: StrykerJS. Optional: uv/npm."
metadata:
  author: wk-agent-ops
  version: "1.0"
---

# mutation-check

Runs diff-based mutation testing on the current change: mutates the code you
touched, checks whether your tests kill each mutant, and reports the survivors.
Surviving mutants are places your code could be broken and no test would notice.

> **Version assumption:** commands target **mutmut v3** and **current StrykerJS**.
> If a command errors on an interface change, re-verify with ctx7 before editing
> this skill (see AGENTS.md rule on library docs).

> **Advisory, not a gate.** This skill never blocks a commit or fails a task.
> It surfaces weak tests for human triage. No mutation-score threshold is enforced.

---

## Step 1 — Resolve project root

```
if $CLAUDE_PROJECT_DIR is set → PROJECT_ROOT=$CLAUDE_PROJECT_DIR
else                          → PROJECT_ROOT=$PWD
```

---

## Step 2 — Detect language & tool

Examine the project root manifest(s):

| Found | Tool | File extensions (exclude tests) |
|-------|------|--------------------------------|
| `pyproject.toml` or `setup.py` | mutmut | `*.py` (exclude `tests/`, `test_*.py`, `*_test.py`) |
| `package.json` | Stryker | `*.ts` / `*.js` (exclude `*.test.*`, `*.spec.*`) |
| both (monorepo) | run each on its own files | — |
| none | **abort** | — |

If none match, announce: **"mutation-check supports Python (mutmut) and TS/JS
(Stryker) only — no supported manifest found."** and stop.

Announce detected tool(s).

---

## Step 3 — Setup gate

This skill does **not** install anything. Check the tool is set up:

```bash
# Python
python -c 'import mutmut' 2>/dev/null && grep -q '^\[tool.mutmut\]' "$PROJECT_ROOT/pyproject.toml" 2>/dev/null
# TS/JS
npx stryker --version 2>/dev/null && [ -f "$PROJECT_ROOT/stryker.config.json" ]
```

If the tool is not installed **or** its config is missing, stop the run and prompt:

```
mutation-check is not set up for this project (tool/config missing).
Run /mutation-setup first — shall I run it now? [y/N]
```

Only proceed past this step once setup is confirmed present.

---

## Step 4 — Compute diff scope

Determine which files to mutate. Default branch = `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'` (fallback `main`).

```bash
cd "$PROJECT_ROOT"
if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git status --porcelain)" ]; then
  # 1) uncommitted work
  CHANGED=$(git diff --name-only HEAD)
elif [ "$(git rev-parse --abbrev-ref HEAD)" != "$DEFAULT_BRANCH" ]; then
  # 2) clean feature branch → since branch point
  CHANGED=$(git diff --name-only "$(git merge-base HEAD "$DEFAULT_BRANCH")")
else
  # 3) clean, on default branch → since last watermark commit
  WM=$(cat "$PROJECT_ROOT/openspec/.mutation-state" 2>/dev/null \
       || cat "$PROJECT_ROOT/.mutation-state" 2>/dev/null)
  BASE=$(printf '%s' "$WM" | grep -oE '^commit=[0-9a-f]+' | cut -d= -f2)
  CHANGED=$([ -n "$BASE" ] && git diff --name-only "$BASE" || git diff --name-only HEAD~1)
fi
```

Filter `CHANGED` to the tool's extensions (Step 2), dropping test files. If the
filtered list is empty, announce **"No mutable changed files in scope"** and stop.

---

## Step 5 — Estimate cost & warn

Rough estimate: `mutants ≈ changed_lines × 1.5`. Count changed lines with
`git diff --numstat <base> -- <files>`.

If estimate exceeds **200 mutants**, warn: **"~N mutants — this may take a while."**
and ask whether to proceed, narrow to specific files, or abort. Otherwise proceed.

---

## Step 6 — Run scoped mutation testing

**mutmut** scopes by **module name pattern**, not file path. Convert each changed
`.py` file to a pattern: `src/pkg/mod.py` → `pkg.mod*` (strip source root + `.py`,
`/`→`.`).

```bash
mutmut run "pkg.mod_a*" "pkg.mod_b*"      # patterns from changed files
mutmut results                             # list survivors after the run
```

**Stryker** scopes by `--mutate` glob, accepting exact files (and line ranges):

```bash
npx stryker run --incremental --force --mutate "src/mod_a.ts" --mutate "src/mod_b.ts"
```

Capture the survivor list and mutation score from each tool's output
(`mutants/summary.json` for mutmut; the Stryker report).

---

## Step 7 — Report

Skip mutants already marked equivalent in the watermark (Step 9). Group survivors
by risk class, **highest risk first**:

1. **conditional** — `>`→`>=`, `&&`→`||`, `if` boundary flips
2. **boundary** — off-by-one, edge values
3. **return-value** — mutated/replaced return
4. **other** — statement deletion, literals, etc.

```
## Mutation Check — <tool>, N files in scope

Mutation score: <killed>/<total> (<pct>%)   ·   equivalent skipped: <k>

| # | Risk | File:line | Mutation | Test gap |
|---|------|-----------|----------|----------|
| 1 | conditional | src/x.py:42 | `>` → `>=` | no test at the boundary |
| 2 | return-value | src/y.ts:10 | `return a` → `return null` | ... |
```

If score is 100% (no survivors), report the score and go straight to Step 9.

---

## Step 8 — Decision menu

```
What would you like to do?
  [1] Add a test to kill a surviving mutant (pick #)
  [2] Mark a mutant equivalent (recorded, skipped next time)
  [3] Skip — update watermark and continue
```

- **[1]** Help write a test targeting the survivor, then re-run just that mutant
  to confirm it's killed. (Level 1 fix, or open an OpenSpec change if larger.)
- **[2]** Record `file:line:mutation` + reason + date in the watermark. Do not
  auto-mark — require the user to state why it's equivalent.
- **[3]** Proceed to watermark update.

Nothing here blocks a commit. Untriaged survivors are tracked, not enforced.

---

## Step 9 — Update watermark

Location: `openspec/.mutation-state` if `openspec/` exists, else `.mutation-state`.
Record the current commit plus any equivalent marks. Ensure the file is gitignored.

```bash
STATE="$PROJECT_ROOT/openspec/.mutation-state"
[ -d "$PROJECT_ROOT/openspec" ] || STATE="$PROJECT_ROOT/.mutation-state"
{
  printf 'commit=%s\n' "$(git rev-parse HEAD)"
  # append/keep lines: equivalent=<file>:<line>:<mutation> # <reason> <date>
} > "$STATE"
grep -qF "$(basename "$STATE")" "$PROJECT_ROOT/.gitignore" 2>/dev/null \
  || printf '%s\n' "${STATE#$PROJECT_ROOT/}" >> "$PROJECT_ROOT/.gitignore"
echo "  ✓ Watermark updated"
```

Confirm: **"Watermark updated at `<commit>`"**
