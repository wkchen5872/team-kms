---
name: "source-command-opsx-commit"
description: "Archive the current openspec change, update docs, and create a conventional git commit"
---

# source-command-opsx-commit

Use this skill when the user asks to run the migrated source command `opsx-commit`.

## Command Template

Complete the feature development cycle inside a git worktree (after `/opsx:apply`):
1. Archive the openspec change (full flow, including sync decision)
2. Update `docs/` files relevant to the feature
3. Create a conventional git commit

Use the **Skill tool** to invoke `openspec-commit`.
