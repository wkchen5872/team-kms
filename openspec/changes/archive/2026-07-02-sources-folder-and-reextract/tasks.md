## 1. Shared: folder path-prefix operations (spec: sources-folder-management)

- [x] 1.1 Test: `renameFolder` rewrites only descendants, siblings untouched; `deleteFolder` archives the subtree only (vaultfs.test.ts, live DB)
- [x] 1.2 `vaultfs.ts`: `deleteFolder(kbId, path)` — service-role archive `WHERE path LIKE prefix||'%' AND user_id`; returns count
- [x] 1.3 `vaultfs.ts`: `renameFolder(kbId, path, newName)` — service-role path prefix rewrite via `substring`, normalized `/…/`
- [x] 1.4 Shared suite green (46)

## 2. API: re-extract + folder routes (specs: document-re-extraction, sources-folder-management)

- [x] 2.1 Test: folder rename/delete routes (only-descendants) + re-extract on a note → 400 (app.test.ts)
- [x] 2.2 `EXTRACTABLE_TYPES` exported from `ingest.ts` (Office/PDF + image sets)
- [x] 2.3 `index.ts`: `POST /v1/documents/:id/re-extract` — 404 if missing, 400 if not extractable, else set `pending` + `enqueue`
- [x] 2.4 `index.ts`: `DELETE`/`PATCH /v1/knowledge-bases/:slug/folders` → `deleteFolder`/`renameFolder`, UNIQUE→409
- [x] 2.5 api suite green (25)

## 3. Web: multi-select wiring (spec: sources-batch-selection)

- [x] 3.1 `FilesGrid` DocumentCard: hover checkbox + selected highlight; checkbox / cmd / shift click → `onSelect(id, e)`; no-selection click still opens
- [x] 3.2 `KBDetail`: pass `selectedIds` + `onSelect` (existing `handleSelect`) into `FilesGrid`; ensure `SelectionActionBar` shows on selection
- [x] 3.3 `SelectionActionBar`: add Re-extract button (`onReextract`)

## 4. Web: re-extract + folder handlers (specs: document-re-extraction, sources-folder-management)

- [x] 4.1 `KBDetail`: `handleReextractDocument(id)` (POST re-extract, optimistic status→processing) + `handleReextractSelected` (parallel, skip non-extractable)
- [x] 4.2 `FilesGrid` DocumentCard context menu: add "Re-extract" for extractable types only (hidden for md/txt)
- [x] 4.3 `KBDetail`: `handleDeleteFolder(path)` (count + confirm + DELETE folders + prune state) and `handleRenameFolder(path,name)` (PATCH folders + update affected paths in state)
- [x] 4.4 `FilesGrid` FolderCard: wrap in ContextMenu with Rename / Delete → parent handlers

## 5. Wrap-up

- [x] 5.1 Updated `docs/architecture/modules/{api-server,web}.md` (re-extract + folder routes, multi-select)
- [x] 5.2 Full workspace `tsc` clean + all suites green (shared 46, converter 24, mcp 18, api 25 = 113)
- [x] 5.3 (verified by user) E2E: hover-checkbox multi-select → batch delete/re-extract; folder rename/delete (with confirm); single re-extract on a PDF (雄獅表格) → content rebuilt; image re-extract re-runs OCR
