---
name: mutation-setup
description: >
  Idempotent one-time setup for mutation testing. Installs/upgrades the tool
  (mutmut for Python, StrykerJS for TS/JS), collects config values, and gitignores
  the state files. Re-runnable anytime — detects existing setup, never clobbers.
license: MIT
compatibility: "Requires bash, git. Python: mutmut v3 (uv or pip). TS/JS: StrykerJS (npm)."
metadata:
  author: wk-agent-ops
  version: "1.0"
---

# mutation-setup

Prepares a project for `/mutation-check`: installs or upgrades the mutation tool
and writes its configuration. Everything interactive and side-effecting lives here,
so `/mutation-check` itself stays zero-config.

> **Version assumption:** targets **mutmut v3** and **current StrykerJS**. If a
> command errors on an interface change, re-verify with ctx7 before editing this
> skill (see AGENTS.md rule on library docs).

> **Idempotent.** Safe to re-run. Detects existing installs and config, shows
> current values, and asks before changing anything — never blindly re-prompts or
> overwrites. Re-run when you want to upgrade the tool or change a config value.

---

## Step 1 — Resolve project root

```
if $CLAUDE_PROJECT_DIR is set → PROJECT_ROOT=$CLAUDE_PROJECT_DIR
else                          → PROJECT_ROOT=$PWD
```

---

## Step 2 — Detect language & tool

| Found | Tool |
|-------|------|
| `pyproject.toml` or `setup.py` | mutmut |
| `package.json` | Stryker |
| both (monorepo) | set up each |
| none | **abort** — "supports Python (mutmut) and TS/JS (Stryker) only" |

Announce detected tool(s). Run the matching branch(es) below.

---

## Step 3 — Install or upgrade the tool (ask first)

**Never install without asking.** Report the current state, then propose the action.

**Python / mutmut:**

```bash
python -c 'import mutmut, importlib.metadata as m; print(m.version("mutmut"))' 2>/dev/null \
  || echo "not installed"
```

- Not installed → ask, then `uv add --dev mutmut` (fallback `pip install mutmut`).
- Installed → offer upgrade: `uv add --dev --upgrade mutmut` (fallback `pip install -U mutmut`). Keep if user declines.

**TS/JS / Stryker:**

```bash
npx stryker --version 2>/dev/null || echo "not installed"
```

- Not installed → ask, then `npx stryker init` (installs `@stryker-mutator/core` and
  generates `stryker.config.json`; it interactively asks test runner / reporters).
- Installed → offer to bump the Stryker devDependencies. Keep if user declines.

---

## Step 4 — Configuration values (idempotent)

**Python / mutmut** — needs the source dir to mutate.

```bash
grep -q '^\[tool.mutmut\]' "$PROJECT_ROOT/pyproject.toml" 2>/dev/null && echo "configured" || echo "missing"
```

- Missing → ask for the source dir (default `src/`), then propose writing and confirm:
  ```toml
  [tool.mutmut]
  paths_to_mutate = "src/"
  ```
- Present → show the current `paths_to_mutate` and ask keep or update. Do not overwrite without confirmation.

**TS/JS / Stryker** — `stryker init` (Step 3) writes `stryker.config.json`. If it
already exists, show the `mutate` and test-runner settings and ask keep or update.
`/mutation-check` scopes with `--mutate` per run, so no per-file globs are needed here.

---

## Step 5 — Gitignore state files

Ensure these are ignored (append any missing line to `.gitignore`):

```
.stryker-tmp/
reports/stryker-incremental.json
.mutation-state
openspec/.mutation-state
```

---

## Step 6 — Confirm ready

Summarize what was installed/configured, then point to the run skill:

```
✅ Mutation setup complete (<tool>).
   Run /mutation-check to audit test strength on your changed files.
```
