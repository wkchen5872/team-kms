## 1. Resumable Upload Path Contract

- [x] 1.1 Add failing TUS unit tests for a nested destination path, root-path fallback, traversal/backslash/null-byte rejection, and verify the focused API test command fails before implementation.
- [x] 1.2 Extend TUS metadata and upload records with normalized destination paths, pass the path into ingestion, and verify the focused TUS tests pass.
- [x] 1.3 Add API tests proving two byte-identical files at distinct destinations both exist while a same-path filename conflict is rejected, then implement the non-deduplicating TUS finalization behavior and verify those tests pass.
- [x] 1.4 Route imported Markdown, text, and CSV through the same TUS source-ingestion behavior as binary files and verify they are created as ready source documents at the requested paths.

## 2. Batch Preflight

- [x] 2.1 Add failing web unit tests for preserve-structure and flatten path mapping, including removal of the selected import-root segment, then implement the minimal path-mapping helper and verify the tests pass.
- [x] 2.2 Add tests for unsupported extensions, existing destination conflicts, and case-insensitive conflicts created within a flattened batch, then implement preflight classification and verify the summary counts and exclusion reasons.
- [x] 2.3 Add a preflight dialog that defaults directory imports to preserved structure, permits flattening, lists exclusions, and starts no transfers when cancelled; verify the component tests cover both choices and cancellation.

## 3. Directory Selection and Bounded Transfer

- [x] 3.1 Add separate “Select files” and “Select folder” upload actions, recursively read browser-provided directory files, and verify unsupported browsers retain multi-file selection with a clear directory-selection message.
- [x] 3.2 Replace unbounded batch `Promise.all` transfer startup with a three-transfer worker pool and verify a unit test observes no more than three simultaneous uploads.
- [x] 3.3 Extend upload state with batch identity, byte totals, queue state, exclusions, and failure reasons; verify aggregate completed/total progress updates while existing per-file document reconciliation still reaches ready or failed.
- [x] 3.4 Present one aggregate batch-progress result with expandable skipped and failed files, remove per-file batch toast noise, and verify successful, partial-failure, and all-excluded UI states.
- [x] 3.5 Route existing file-picker and operating-system multi-file drop entry points through the same preflight and bounded batch flow, then verify uploads started from a nested Team KMS folder retain that destination.

## 4. Integration, Documentation, and Verification

- [x] 4.1 Add an integration test covering a mixed Markdown, CSV, and binary directory import with nested preserved paths, flattened conflicts, unsupported files, and byte-identical files at different destinations; verify all resulting document paths and statuses.
- [x] 4.2 Update the web, API, and upload-workflow architecture documentation with directory mapping, optional TUS path metadata, conflict behavior, and the three-transfer limit; verify documentation references match implemented routes and UI labels.
- [x] 4.3 Run `openspec validate add-folder-batch-upload --strict`, the repository typecheck, lint checks if configured, and all tests; resolve every failure and record all tasks complete only when the full verification set passes.
