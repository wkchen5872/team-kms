## 1. Tokens (globals.css + tailwind.config)

- [x] 1.1 `globals.css` `:root`: replace light HSL with the default palette (bg #f8fafc, card #fff, secondary/muted/accent #f1f5f9, fg #0f172a, muted-fg #64748b, border/input #e2e8f0, accent-blue #3b82f6, ring ~#64748b); `--radius: 0.75rem`; primary stays dark
- [x] 1.2 Add `--success` (green) + `--warning` (amber) to BOTH `:root` and `.dark`; leave the rest of `.dark` untouched
- [x] 1.3 `tailwind.config.ts`: map `success`/`warning` → `hsl(var(--x))`
- [x] 1.4 Sanity: `pnpm --filter @team-kms/web exec tsc --noEmit`; eyeball a page in light + dark (dark unchanged)

## 2. wikis list → dashboard (biggest delta)

- [x] 2.1 `wikis/page.tsx`: header block — eyebrow + bilingual title「知識管理系統｜Team KMS」+ user pill + SYSTEM STATUS ● ONLINE + Settings link
- [x] 2.2 KB card: eyebrow (`KBASE // …`), accent-blue title, description, `slug:` line, READY status dot; keep existing create entry (button + empty-state CTA + dialog)

## 3. files / sources polish

- [x] 3.1 `FilesGrid.tsx`: file-type pill (uppercase ext) + size label + type-colored icon helper (md→success, pdf→destructive, doc/docx/ppt/pptx→accent-blue, image→warning, else muted); card radius/shadow; processing shows "EXTRACTING"
- [x] 3.2 (toolbar 上傳→dark button; breadcrumb reskinned) `FilesGrid.tsx`: breadcrumb header (`KB / 所有檔案 (Sources)`) + 篩選/上傳 buttons styling
- [x] 3.3 (3 equal action buttons + DATA SOURCES + accent-blue active + user block ACCESS: ADMIN) `KBSidenav.tsx`: section labels (WIKI / DATA SOURCES), source count badge, bottom user block (avatar + email + `ACCESS: ADMIN`)

## 4. settings + wiki

- [x] 4.1 `settings/page.tsx`: outer panel card + back link + numbered bilingual section headers (Appearance / API Keys); appearance row styled (keep existing light/dark toggle, no new theme); API key list styling (name + `sk_…` prefix + last-used + delete)
- [x] 4.2 (markdown reskinned; right TOC active→accent-blue + bilingual label) `WikiContent.tsx` / `AppShell.tsx`: markdown typography + background alignment; right TOC optional (skip if time-boxed)

## 5. Verify

- [x] 5.1 `pnpm --filter @team-kms/web exec tsc --noEmit` clean + `next build` passes
- [x] 5.2 (user, verified) Visual pass vs the 4 default mockups (light); dark pass on each page for no regression
- [x] 5.3 Backend suites unaffected (frontend-only) — spot check `pnpm -r test` if touched shared types (expected none)
