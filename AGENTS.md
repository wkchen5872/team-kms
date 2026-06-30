# Harness Engineering Protocol

| Field   | Value                                                   |
| ------- | ------------------------------------------------------- |
| Version | 1.0.0                                                   |
| Role    | Mandatory operational framework for all AI agent tasks. |

---

## 1. Core Mandates

As an AI developer agent, you must operate within the "Verification Boundary" defined by this project's Harness. All changes MUST be verified before completion.

## 2. Execution Prerequisites

Before performing any task, concurrently analyze:

- **Architecture Guide:** `docs/architecture.md` — module boundaries and data flow
- **Coding Conventions:** `docs/conventions.md` — style, naming, and prohibited patterns
- **OpenSpec Specs:** `openspec/specs/` — source of truth for requirements (Level 2+ only)

## 3. The Autonomous Loop (SOP)

> Applies to Level 2+ tasks. Level 1 tasks follow a lighter flow — see Section 6.

1. **Assertive TDD:** Write or update tests based on the Spec *before* implementation.
2. **Compliant Implementation:** Write code adhering to `architecture.md` and `conventions.md`.
3. **Automated Scan:** Execute `/opsx:verify` (Claude Code) or `/openspec-verify-change` (other AI CLI tools), plus native project tools (Linter, Type Check, Tests).
4. **Self-Healing:** If verification fails, analyze logs, fix the implementation, and repeat until green.

## 4. Prohibited Actions

- ❌ **No Warning Suppression:** Never use `// @ts-ignore`, `any`, or skip lint errors.
- ❌ **No Scope Creep:** Do not implement features outside the OpenSpec definition.
- ❌ **No Structural Breach:** Do not violate the dependency rules in `architecture.md`.

## 5. Definition of Done (DoD)

- [ ] `/opsx:verify` (or equivalent) returns success — Exit Code 0 (Level 2+ only).
- [ ] All existing tests pass; no regressions.
- [ ] Aim for 80%+ test coverage for the modified logic path. If not met, highlight in summary and explain why.
- [ ] Documentation (README/Docs) is synced with changes.

---

## 6. Development Protocol by Task Scale

Which protocol to use depends on task scale.

### Level 1 — Small Tasks

_Daily edits, single skill/rule adjustments, minor fixes._

Follow **Karpathy Guidelines**:

**Think Before Acting**
- State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop and ask. Do not guess and code.

**Simplicity First**
- No features, abstractions, or configurability beyond what was explicitly asked.
- No error handling for impossible scenarios.
- If a solution can be 50 lines, don't write 200.

**Surgical Changes**
- Edit only the code directly required by the request.
- Do not improve, refactor, or reformat adjacent code.
- Do not delete pre-existing dead code unless explicitly asked.
- Every changed line must trace directly to the user's request.

**Testing for Level 1**
- Formal TDD (Red → Green → Refactor) is not required.
- You must still run the existing test suite after changes and confirm no regressions before marking complete.

### Level 2 — Medium Features

_New skill, new agent, new workflow._

Use **Plan Mode + OpenSpec** flow:

1. **Plan Mode** — discuss design, produce a concrete plan
2. **OpenSpec** — `/opsx:new` to create proposal, design, specs, tasks
3. **Implementation** — `/opsx:apply` with TDD (see Section 3)

### Level 3 — Architectural Changes

_Cross-module design, multi-skill systems._

Use **Plan Mode + OpenSpec** with agent split:

1. **Plan Mode** — brainstorm approaches, get design approval
2. **OpenSpec** — PM Agent creates change artifacts (`/opsx:ff`)
3. **Implementation** — RD Agent executes `/opsx:apply`
