<!-- Managed by wk-agent-ops · do not edit here — re-running install.sh overwrites this file. -->

# Agent Operating Protocol

> This file is the **map, not the manual**. Claude Code is the primary tool, but
> the protocol is portable to any AGENTS.md-aware tool — every rule here holds
> regardless of which tool reads it. Tool-specific commands appear only as
> parenthetical examples; detailed standards live in `docs/` and load on demand.

| Field   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Version | 2.0.0                                                     |
| Scope   | Operational framework for all AI agent tasks in this repo |

---

## 1. Before You Start (read only what the task needs)

- **Always:** `docs/architecture.md` (module boundaries, data flow) and
  `docs/conventions.md` (style, naming, prohibited patterns).
- **When the task touches `openspec/`:** the relevant specs in
  `openspec/specs/` — source of truth for requirements.
- **When the task touches `docs/`:** `docs/okf-conventions.md` — doc authoring
  rules. (Not needed for code-only tasks.)

## 2. Hard Prohibitions (apply to every task, no exceptions)

- ❌ **Never touch vendored / generated agent config.** Do not create, edit, or
  delete generated agent-config directories (skills, rules, instructions
  installed by tooling). Much of it is third-party and unverified; edits cause
  silent downstream breakage. If a change there seems required, **stop and ask
  the human.** The authoritative list of protected directories lives in the
  enforcement hook, not here.
- ❌ **No warning suppression:** never use `// @ts-ignore`, `any`, or skip lint
  errors to force a pass.
- ❌ **No scope creep:** implement only what the active OpenSpec change (or the
  explicit request) defines.
- ❌ **No structural breach:** never violate the dependency rules in
  `docs/architecture.md`.

> **Enforcement note:** the vendored-config prohibition is backed mechanically
> (a permission deny rule + a PreToolUse hook). Prose here is advisory; the hook
> is the real boundary.

## 3. Protocol by Task Scale

**Level 1 — Small tasks** *(doc edits, config/setting tweaks, minor fixes)*
No formal spec. Apply these rules:
- State assumptions before acting; if the request is ambiguous, stop and ask —
  do not guess and code.
- Surgical changes only: edit only what the request requires. Do not refactor
  or reformat adjacent code, and do not delete existing dead code unless asked.
- No abstractions or configurability beyond what was asked.
- Formal TDD not required, but run the existing test suite and confirm no
  regressions before marking done.

**Level 2 — Spec-driven tasks** *(new skill, agent, workflow, or cross-module change)*
Everything beyond a Level 1 tweak runs the full OpenSpec flow, regardless of scale.
Each stage below states its intent; the parenthetical is the Claude Code example —
on any other tool, use that tool's equivalent for the same stage.

1. **Plan** — explore the problem and produce a concrete design.
   *(Claude Code: Plan Mode + `/opsx:explore`)*
2. **Spec** — create the change artifacts (proposal, design, specs, tasks), then
   **get human review of the design** before coding.
   *(Claude Code: `/opsx:new`, or `/opsx:ff` to scaffold all at once)*
3. **Implement** — build against the spec using the loop in §4.
   *(Claude Code: `/opsx:apply`)*
4. **Seal** — archive the change and commit.
   *(Claude Code: `/opsx:archive` or `/opsx:commit`)*

## 4. Implementation Loop (Level 2)

1. **Test first** — write/update tests from the spec before implementation.
2. **Implement** — adhere to `docs/architecture.md` and `docs/conventions.md`.
3. **Verify** — run the OpenSpec verify stage against the spec, plus the native
   linter, type check, and tests. *(Claude Code: `/opsx:verify`)*
4. **Self-heal** — on failure, read logs, fix, repeat until green.

## 5. Definition of Done (Level 2)

> "Done" means the mechanical gates below pass — not the agent's self-assessment.

- [ ] The OpenSpec verify stage passes. *(Claude Code: `/opsx:verify`)*
- [ ] The pre-commit gate passes (tests plus any coverage gate the project
      configures). Never bypass it with `git commit --no-verify`.
- [ ] Change archived and committed per the OpenSpec commit convention.
- [ ] Docs synced with changes. If any file under `docs/` was touched, it
      conforms to the rules in `docs/okf-conventions.md`.

> **Enforcement scales with the project.** The pre-commit hook is the boundary
> for small/solo projects; projects with CI run the same checks server-side on
> push. Only what the configured gate actually enforces is guaranteed here.

## 6. Cross-Tool Notes

- `AGENTS.md` is the single shared source of truth. If a tool-specific config
  file exists (e.g. a Claude-only `CLAUDE.md`), keep it lean and have it
  **import** this file rather than duplicating it.
- Commands in parentheses above are Claude Code examples. On any other tool, map
  each **stage** (plan → spec → review → implement → verify → seal) to that
  tool's equivalent — the sequence is the invariant; the command names are not.
