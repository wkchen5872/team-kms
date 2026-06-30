---
name: entropy-check
description: >
  Periodic health audit for AI agent projects. Detects documentation drift,
  dead references, unused code, and over-complex files.
  Auto-fixes broken doc links; reports other findings for human review.
license: MIT
compatibility: "Requires bash, git. Optional: jq, openspec CLI."
metadata:
  author: wk-agent-ops
  version: "2.1"
---

# entropy-check

Runs a structured health audit of the current project. Detects drift and dead
weight that accumulates between feature cycles.

---

## Step 1 — Resolve project root

Determine the project root using environment variables:

```
if $CLAUDE_PROJECT_DIR is set → PROJECT_ROOT=$CLAUDE_PROJECT_DIR
else                          → PROJECT_ROOT=$PWD
```

---

## Step 2 — Detect context

Examine the project root to classify the project type:

```
if  $PROJECT_ROOT/openspec/changes/ exists → context = openspec
else                                        → context = standard
```

Announce: **"Context detected: `<context>`"**

Determine which audits to run:

| Audit | standard | openspec |
|-------|----------|----------|
| D2 — Docs completeness    | ✓ | ✓ |
| D3 — Dead references      | ✓ | ✓ |
| C1 — Unused code          | ✓ | ✓ |
| O1 — Stale active changes | — | ✓ |
| R1 — Refactor candidates  | ✓ | ✓ |

---

## Step 3 — Run audits

Execute each applicable audit and collect findings.

### D2 — Docs completeness

Scan `docs/architecture.md` and `docs/conventions.md` for placeholder text:

```bash
for doc in "$PROJECT_ROOT/docs/architecture.md" "$PROJECT_ROOT/docs/conventions.md"; do
  if [ -f "$doc" ]; then
    if grep -qiE 'TODO|\[填入\]' "$doc" 2>/dev/null; then
      # FINDING: D2 — placeholder text in <doc>
    fi
    # Empty section: "## Heading\n\n## Next" or "## Heading\n<!-- ... -->\n## Next"
    if grep -qE '^## ' "$doc" 2>/dev/null; then
      # Check for sections with no real content (only comments or whitespace between headers)
      # FINDING: D2 — empty section in <doc> if detected
    fi
  fi
done
```

**No auto-fix** — requires human knowledge to fill.

### D3 — Dead references

Scan AGENTS.md and `docs/*.md` for two types of broken references.

**1. Backtick path references:**

```bash
for file in "$PROJECT_ROOT/AGENTS.md" "$PROJECT_ROOT/docs/"*.md; do
  [ -f "$file" ] || continue
  grep -oE '`(scripts/|\.claude/|template/)[^`]+`' "$file" \
    | sed "s/\`//g" \
    | while read -r ref_path; do
        if [ ! -e "$PROJECT_ROOT/$ref_path" ]; then
          # FINDING: D3 — broken backtick reference '$ref_path' in <file>
        fi
      done
done
```

**2. Markdown link references (`[text](target)`):**

```bash
for file in "$PROJECT_ROOT/AGENTS.md" "$PROJECT_ROOT/docs/"*.md; do
  [ -f "$file" ] || continue
  grep -oE '\[([^\]]+)\]\(([^)]+)\)' "$file" \
    | while IFS= read -r match; do
        target=$(echo "$match" | sed 's/.*](\(.*\))/\1/')
        # Skip external links
        [[ "$target" =~ ^https?:// || "$target" =~ ^mailto: ]] && continue
        # Strip anchor from path
        path_part="${target%%#*}"
        anchor_part="${target#*#}"
        [ "$target" = "$anchor_part" ] && anchor_part=""
        if [ -n "$path_part" ]; then
          abs_path="$PROJECT_ROOT/$path_part"
          if [ ! -e "$abs_path" ]; then
            # FINDING: D3 — broken MD link '$path_part' in <file>
          elif [ -n "$anchor_part" ]; then
            # Validate anchor against headings in target file
            # FINDING: D3 — broken anchor '#$anchor_part' in '$path_part' in <file> if heading not found
          fi
        else
          # Same-file anchor: validate against current file's headings
          if [ -n "$anchor_part" ]; then
            # FINDING: D3 — broken same-file anchor '#$anchor_part' in <file> if not found
          fi
        fi
      done
done
```

**Auto-fix available (for broken path references — backtick and MD link):**

For each broken path reference:
1. Extract the filename: `basename "$broken_path"`
2. Search the project: `find "$PROJECT_ROOT" -name "$filename" -not -path "*/\.*"`
3. Apply fix:
   - **Exactly one match**: Update the path in-place to the found location
   - **Zero matches**: Remove link syntax, keeping just the label text (e.g., `[text](broken)` → `text`)
   - **Multiple matches**: Report all candidates; leave original unchanged for human resolution

Broken anchors are reported only — no auto-fix.

### C1 — Unused code

Detect declared-but-unused code. All findings are labeled **"confirm before removing"** —
these are heuristic checks and may produce false positives.

**Bash: unused functions**

For each `.sh` file, extract function names and check if each name appears in any other `.sh` file:

```bash
find "$PROJECT_ROOT" -name "*.sh" -not -path "*/\.*" | while read -r sh_file; do
  grep -oE '^[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\(\)' "$sh_file" \
    | sed 's/[[:space:]]*()//' \
    | while read -r fn_name; do
        total=$(grep -rn "$fn_name" "$PROJECT_ROOT" --include="*.sh" | wc -l)
        if [ "$total" -le 1 ]; then
          # FINDING: C1 — $sh_file: function '$fn_name' appears unused (confirm before removing)
        fi
      done
done
```

**Python: unused imports**

For each `.py` file, extract imported names and check if each appears in the file body:

```bash
find "$PROJECT_ROOT" -name "*.py" -not -path "*/\.*" | while read -r py_file; do
  grep -E '^(import |from .+ import )' "$py_file" \
    | while read -r import_line; do
        name=$(echo "$import_line" | sed 's/^.*import[[:space:]]*//' | awk '{print $1}' | tr -d ',')
        [ -z "$name" ] && continue
        # Skip re-exports: name in __all__ counts as used
        occurrences=$(grep -c "$name" "$py_file" 2>/dev/null || echo 0)
        if [ "$occurrences" -le 1 ]; then
          # FINDING: C1 — $py_file: import '$name' appears unused (confirm before removing)
        fi
      done
done
```

**TypeScript/JavaScript: unused named imports**

```bash
find "$PROJECT_ROOT" \( -name "*.ts" -o -name "*.js" \) -not -path "*/\.*" \
  | while read -r ts_file; do
      # Skip type-only imports
      grep -E '^import \{' "$ts_file" | grep -v '^import type' \
        | grep -oE '\{[^}]+\}' | tr ',' '\n' | sed 's/[{}[:space:]]//g' \
        | while read -r imported_name; do
            [ -z "$imported_name" ] && continue
            occurrences=$(grep -c "$imported_name" "$ts_file" 2>/dev/null || echo 0)
            if [ "$occurrences" -le 1 ]; then
              # FINDING: C1 — $ts_file: import '$imported_name' appears unused (confirm before removing)
            fi
          done
    done
```

**No auto-fix** — C1 findings always require human confirmation.

### O1 — Stale active changes (openspec only)

Find changes under `openspec/changes/` (excluding `archive/`) not modified in 14+ days:

```bash
for change_dir in "$PROJECT_ROOT/openspec/changes"/*/; do
  name=$(basename "$change_dir")
  [ "$name" = "archive" ] && continue
  last_modified=$(find "$change_dir" -type f -printf '%T@\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d. -f1)
  now=$(date +%s)
  age_days=$(( (now - last_modified) / 86400 ))
  if (( age_days > 14 )); then
    # FINDING: O1 — change '<name>' last modified <age_days> days ago
  fi
done
```

**No auto-fix** — prompt: archive or continue?

### R1 — Refactor candidates

**Read watermark (openspec context):**

```bash
WATERMARK_FILE="$PROJECT_ROOT/openspec/.entropy-state"
ARCHIVE_COUNT=""
if [ -f "$WATERMARK_FILE" ]; then
  ARCHIVE_COUNT=$(cat "$WATERMARK_FILE" | tr -d '[:space:]')
fi
```

Determine recommendation level from archive count:
- Absent or < 5 → recommend `/simplify` (label: "project maturity: early")
- 5–15 → recommend `/simplify` as primary; note "consider `/refactor` for structural issues"
- > 15 → recommend `/refactor` (label: "project maturity: high")

**Detect large/complex files (excluding `openspec/` directory):**

```bash
find "$PROJECT_ROOT" \
  -not -path "*/openspec/*" -not -path "*/\.*" \
  \( -name "*.sh" -o -name "*.py" -o -name "*.ts" -o -name "*.js" \) \
  | while read -r code_file; do
      line_count=$(wc -l < "$code_file")
      ext="${code_file##*.}"

      # Large shell script
      if [ "$ext" = "sh" ] && [ "$line_count" -gt 150 ]; then
        # FINDING: R1 — $code_file ($line_count lines) — candidate for /simplify
      fi

      # Large code file (Python/TS/JS)
      if [[ "$ext" =~ ^(py|ts|js)$ ]] && [ "$line_count" -gt 300 ]; then
        # FINDING: R1 — $code_file ($line_count lines) — candidate for /simplify or /refactor
      fi

      # High marker density
      marker_count=$(grep -cE 'TODO|FIXME|HACK' "$code_file" 2>/dev/null || echo 0)
      if [ "$marker_count" -ge 3 ]; then
        # FINDING: R1 — $code_file ($marker_count markers) — consider addressing debt
      fi
    done
```

Display R1 findings with the recommendation level and archive count:
`Recommendation: /simplify (archive count: <N>, project maturity: early)`

---

## Step 4 — Display results

Show a summary table:

```
## Entropy Check Results — <context> context

| Audit | Status | Findings |
|-------|--------|----------|
| D2 — Docs completeness   | ✓ / ⚠️ N | <description> |
| D3 — Dead references     | ✓ / ⚠️ N | <description> |
| C1 — Unused code         | ✓ / ⚠️ N | <description> |
| O1 — Stale active changes | ✓ / ⚠️ N | <description> | ← openspec only
| R1 — Refactor candidates | ✓ / ⚠️ N | <recommendation level> |
```

Then list all findings grouped by audit code.

---

## Step 5 — Decision menu

**If findings exist:**

Present the user with:

```
What would you like to do?
  [1] Auto-fix fixable findings (D3)
  [2] Create OpenSpec change to address structural findings
  [3] Skip — update watermark and continue
```

Wait for user response, then execute the chosen action:

- **[1] Auto-fix:**
  - D3: For each broken path reference (backtick or MD link):
    - Single match → update path in-place
    - Zero matches → remove link syntax, keep label text
    - Multiple matches → report candidates, skip auto-fix for that item
  - C1: **Not eligible for auto-fix** — findings require human confirmation.
  - After fixes, confirm what was changed.

- **[2] Create OpenSpec change:**
  - Summarize structural findings and suggest: `openspec new change entropy-cleanup`
  - Do not execute automatically.

- **[3] Skip:**
  - Proceed to watermark update.

**If no findings exist:**
```
✅ All audits passed — project is clean!
```
Proceed to watermark update automatically.

---

## Step 6 — Update watermark

If context is `openspec`:

1. Count the current number of directories in `openspec/changes/archive/`.
2. Write that count to `openspec/.entropy-state` (single integer, no trailing newline).
3. Ensure `openspec/.entropy-state` is in `.gitignore`:
   - Check if `openspec/.entropy-state` appears in `.gitignore`.
   - If not, append the line `openspec/.entropy-state` to `.gitignore`.

```bash
ARCHIVE_COUNT=$(find "$PROJECT_ROOT/openspec/changes/archive" \
  -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d '[:space:]')
printf '%s' "$ARCHIVE_COUNT" > "$PROJECT_ROOT/openspec/.entropy-state"
echo "  ✓ Watermark updated: $ARCHIVE_COUNT"
```

Confirm: **"Watermark updated to `<count>`"**
