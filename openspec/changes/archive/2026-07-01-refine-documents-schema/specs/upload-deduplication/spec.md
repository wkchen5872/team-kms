## ADDED Requirements

### Requirement: Source uploads carry a raw-bytes file hash

The system SHALL compute a `file_hash` (SHA-256 of the original uploaded bytes) at ingest time and
store it on `documents.file_hash`, indexed for lookup. The hash MUST be computed from the raw bytes
before any extraction (not from extracted/normalized content).

#### Scenario: Hash computed at ingest
- **WHEN** a source file is ingested via `ingestSource`
- **THEN** `documents.file_hash` is set to the SHA-256 of the uploaded bytes

#### Scenario: Existing rows are not backfilled
- **WHEN** the migration adds `file_hash`
- **THEN** pre-existing rows keep `file_hash` NULL and only new uploads populate it

### Requirement: Duplicate uploads are deduplicated within a knowledge base

The system SHALL treat an ingested file as a duplicate when its `file_hash` matches an existing
non-archived document in the same knowledge base. For a duplicate, the system MUST NOT re-upload the
bytes to S3, MUST NOT re-run extraction, and SHALL return a reference to the existing document.
Deduplication is scoped per knowledge base, so identical bytes uploaded to a different knowledge base
SHALL be ingested as a new document.

#### Scenario: Re-uploading the same file is deduplicated
- **WHEN** a file whose `file_hash` already exists on an active document in the same KB is ingested
- **THEN** no new S3 object or extraction job is created and the existing document is returned

#### Scenario: Same bytes in a different KB are allowed
- **WHEN** the same file is uploaded to a different knowledge base
- **THEN** it is ingested normally as a new document

#### Scenario: A distinct file is ingested normally
- **WHEN** a file whose `file_hash` does not match any active document in the KB is ingested
- **THEN** it is stored and processed as a new document
