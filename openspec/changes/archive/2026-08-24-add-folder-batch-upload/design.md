## Context

See `proposal.md` for motivation and `specs/batch-folder-upload/spec.md` for observable behavior. The web currently accepts multiple files, sends Markdown and text through the note endpoint, and sends other types through TUS. The TUS metadata contains only filename and knowledge-base slug, so binary files lose the destination selected in the file browser. Upload state is tracked per file and the current implementation starts all selected files concurrently.

The API already accepts a document path in ingestion, and the file browser already represents nested folders through document paths. The change therefore extends the existing path and TUS models rather than introducing a second storage or upload system.

## Goals / Non-Goals

**Goals:**

- Use one source-upload path for all supported file types.
- Preserve safe relative paths from a browser directory selection.
- Keep server-side path and uniqueness checks authoritative.
- Keep browser and API resource use bounded for large batches.
- Present one coherent batch result while retaining per-file diagnostics.

**Non-Goals:**

- Preserving empty local directories.
- Uploading folders by recursively interpreting operating-system drag-and-drop entries.
- Overwriting, versioning, or auto-renaming conflicting documents.
- Persisting an interrupted batch across browser sessions.
- Adding a server-side filesystem import endpoint.

## Decisions

### 1. Treat the selected directory as the import root

For directory selection, derive each file's relative path from the browser-provided relative pathname and remove its first segment. In preserve mode, append the remaining parent path to the currently viewed Team KMS folder. In flatten mode, discard all parent segments.

This avoids introducing export-wrapper names such as timestamped directories into the knowledge base. A user who wants that outer directory can create or enter a Team KMS folder before starting the import.

Alternative considered: always include the selected directory name. Rejected because the outer directory often describes a local export operation rather than knowledge organization.

### 2. Use a preflight model shared by multi-file and directory uploads

Convert every selected browser `File` into a preflight item containing source-relative path, filename, size, extension, resolved destination path, eligibility, and an optional exclusion reason. Use the currently loaded document list to identify expected conflicts, and compare resolved batch destinations case-insensitively to find conflicts introduced by flattening.

The server remains authoritative because another client can create a document after preflight. A uniqueness failure during finalization is returned as a per-file conflict instead of mutating the existing document.

Alternative considered: begin transfer immediately and report conflicts afterward. Rejected because large directory selections need a trustworthy preview before hundreds of requests begin.

### 3. Send all imported source files through TUS

Use TUS for Markdown, text, CSV, Office, PDF, and supported image files. Extend upload metadata and the in-memory upload record with a normalized destination path. At finalization, pass that path to asynchronous ingestion.

This keeps imported Markdown as source material and gives all types the same progress, path, validation, and error behavior. The note endpoint remains for user-authored notes rather than file import.

Alternative considered: retain the note endpoint for Markdown and add only a TUS path field for binaries. Rejected because it preserves two different batch semantics and makes aggregate progress inconsistent.

### 4. Preserve byte-identical files at distinct destinations

TUS finalization bypasses content-hash deduplication after destination conflict checks. Filename-and-path uniqueness prevents accidental re-import at the same destination, while distinct filenames or paths remain separate source records even if their bytes match.

Alternative considered: retain content-hash deduplication. Rejected because it silently omits legitimate data-room records whose names and locations carry meaning.

### 5. Validate and normalize paths on the API boundary

TUS upload creation accepts an optional path metadata field, defaulting to `/` for backward compatibility. Normalize it to an absolute knowledge-base directory path and reject empty segments with ambiguous meaning, traversal segments, backslashes, null bytes, or paths outside the namespace. Store only the normalized value in the upload record.

Client-side normalization is retained for preview accuracy but is not a security boundary.

### 6. Use a small fixed transfer pool and aggregate state

Run at most three TUS transfers concurrently. Add a batch identifier and byte size to upload-store items so progress can be aggregated while existing per-file reconciliation continues to track processing and ready states. The UI displays one batch summary with an expandable list for unsupported, conflicting, or failed files instead of emitting a toast for every file.

Three concurrent transfers bound the TUS server's in-memory buffering while still allowing useful throughput. The extraction queue remains single-threaded and unchanged.

Alternative considered: retain `Promise.all` for every selected file. Rejected because directory imports can allocate many in-memory uploads and overwhelm both the browser and API.

### 7. Keep supported-type policy aligned with ingestion

Preflight eligibility is derived from the file types the API can actually ingest. The UI SHALL not advertise or queue formats that the current ingestion pipeline cannot finalize. Tests cover the shared behavior so additions require updating both boundaries deliberately.

## Risks / Trade-offs

- [Directory selection uses browser-specific relative-path support] → Detect support before showing or enabling the action, while retaining standard multi-file selection.
- [Client preflight can become stale] → Enforce path uniqueness and safe paths again on the API boundary and report late conflicts per file.
- [TUS buffers each active file in API memory] → Limit concurrent transfers to three; changing storage strategy remains a separate scalability change.
- [Flattening loses source context] → Make preserved structure the default and expose all flattening collisions before transfer.
- [A browser refresh loses batch presentation] → Uploaded documents and server-side processing remain durable; cross-session batch recovery is explicitly out of scope.

## Migration Plan

1. Extend and deploy the API path metadata handling first; clients that omit path continue to upload to `/`.
2. Deploy the web preflight, directory picker, bounded queue, and aggregate batch presentation.
3. Verify existing single-file, multi-file, drag-drop, resumable upload, and processing reconciliation paths.
4. Roll back the web independently if needed; the optional API metadata remains backward-compatible. No database migration is required.
