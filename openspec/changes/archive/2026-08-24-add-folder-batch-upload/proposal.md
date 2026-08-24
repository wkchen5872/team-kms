## Why

The web UI can select multiple files, but binary uploads do not carry the selected destination path and users cannot import a local directory tree. Large data-room imports therefore require external scripts and cannot be completed safely from the product UI.

## What Changes

- Add separate UI actions for selecting multiple files and selecting a directory.
- Ask directory-upload users whether to preserve relative directory structure or flatten all files into the current Team KMS folder, defaulting to preservation.
- Preflight each batch before transfer and report supported files, unsupported files, and destination-path conflicts.
- Carry the destination path through the resumable-upload API for every uploaded source type.
- Upload files with bounded concurrency and show aggregate progress plus per-file failures.
- Skip conflicting files rather than overwriting, auto-renaming, or silently discarding them.

## Capabilities

### New Capabilities

- `batch-folder-upload`: Multi-file and directory selection, path mapping, preflight conflict handling, resumable transfer, and batch progress behavior.

### Modified Capabilities

None.

## Impact

- Web upload controls, upload state, progress presentation, and file-selection handling under `apps/web`.
- TUS metadata parsing and ingestion path propagation under `apps/api`.
- Upload and API tests covering nested paths, flattened imports, conflicts, unsupported types, and bounded batches.
- No database schema change or new runtime dependency is expected.
