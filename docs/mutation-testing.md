---
type: Playbook
title: Mutation Testing Playbook
description: How to audit test effectiveness with the mutation-setup and mutation-check skills.
tags: [testing, mutation-testing, tdd, playbook]
timestamp: 2026-07-09T00:00:00Z
---

<!-- Managed by wk-agent-ops · do not edit here — re-running install.sh overwrites this file. -->

# Mutation Testing Playbook

Line coverage proves a line **ran**; it does not prove a test would **notice if
that line broke**. Mutation testing closes that gap: it introduces small faults
(mutants) into your code and checks whether your tests turn red. A surviving
mutant is a spot where the code could be wrong and no test would catch it.

This is the second line of defence behind the TDD rules in
[/docs/agent-protocol.md](/docs/agent-protocol.md) §4 — advisory, never a commit gate.

## Two skills, split by concern

| Skill | When | Nature |
|-------|------|--------|
| `/mutation-setup` | first time, upgrades, config changes | idempotent, interactive, side-effecting |
| `/mutation-check` | every change / verify step | zero-config, diff-scoped run |

`mutation-setup` owns all install/upgrade and config side effects — it is
idempotent, so re-running detects existing setup and asks before changing
anything. `mutation-check` stays pure: it opens with a setup gate (if the tool
isn't installed/configured it points you to `/mutation-setup`), then runs.

## Diff-based by design

`mutation-check` only mutates the files in your current change, not the whole
codebase — mutation testing is slow, and the change is what needs the audit.
Scope resolution:

1. Uncommitted work → `git diff HEAD`
2. Clean feature branch → since the merge-base with the default branch
3. Clean on default branch → since the last watermark commit

Note: mutating one changed file pulls its **whole module** into scope, so a
trivial edit is enough to audit a module's full test strength during a dogfood.

## Tools per language

| Language | Tool | Scoping mechanism |
|----------|------|-------------------|
| Python | [mutmut](https://mutmut.readthedocs.io/en/latest/) | module-name pattern (`pkg.mod*`) |
| TS / JS | [StrykerJS](https://stryker-mutator.io/) | `--mutate` glob (file, even line ranges) |

The installer never touches a target project's `pyproject.toml`, `package.json`,
or `stryker.config.json` — those are project-owned. `mutation-setup` manages them
at run time, with confirmation.

## Reading the results

Surviving mutants are ranked by risk class, highest first: **conditional**
(`>`→`>=`, `&&`→`||`), **boundary**, **return-value**, then **other** (statement
deletion, literals). Each survivor offers a triage choice: add a test, mark
equivalent (recorded in the watermark, skipped next time), or skip with a reason.
No mutation-score threshold is enforced — triage is advisory tracking, not a gate.

## Design positioning

This toolkit deliberately differs from two community references (see Citations):

- **Adopted** from the test-architect agent: the *revert-check* (revert the
  implementation, confirm the test goes red) and the surviving-mutant *risk
  classification*.
- **Not adopted**: a hard-wired `score < 80%` threshold (arbitrary per module,
  and counter to this repo's no-coverage-gate stance), and the one-shot
  setup-checklist shape (no diff-scope focus, CI-gate heavy, no triage loop).

# Citations

[1] [StrykerJS — Mutation testing for JavaScript and TypeScript](https://stryker-mutator.io/)
[2] [stryker-mutator/stryker-js (source)](https://github.com/stryker-mutator/stryker-js)
[3] [mutmut — Python mutation testing (docs)](https://mutmut.readthedocs.io/en/latest/)
[4] [add-mutation-testing command (design reference, not adopted)](https://github.com/davepoon/buildwithclaude/blob/main/plugins/all-commands/commands/add-mutation-testing.md)
[5] [test-architect agent (design reference, partially adopted)](https://github.com/rohitg00/awesome-claude-code-toolkit/blob/main/agents/quality-assurance/test-architect.md)
