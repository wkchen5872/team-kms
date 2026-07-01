## ADDED Requirements

### Requirement: Document kind classification

The system SHALL classify every `documents` row with a `kind` column whose value is one of
`raw`, `wiki`, or `asset`. The column MUST be `NOT NULL`, constrained by a `CHECK` to those three
values, and indexed. `kind` MUST be assigned explicitly at write time (it MUST NOT be inferred by a
generated column, because `asset` is not derivable from `path`).

#### Scenario: Uploaded source is classified as raw
- **WHEN** a source file is ingested via `ingestSource`
- **THEN** its `documents.kind` is set to `raw`

#### Scenario: Wiki page is classified as wiki
- **WHEN** a document is created under the `/wiki/` path via the MCP create/edit flow
- **THEN** its `documents.kind` is set to `wiki`

#### Scenario: Claude-authored SVG/CSV is classified as asset
- **WHEN** the MCP `create` tool creates an `.svg` or `.csv` document
- **THEN** its `documents.kind` is set to `asset`

#### Scenario: Invalid kind is rejected
- **WHEN** an INSERT/UPDATE sets `kind` to a value other than `raw`/`wiki`/`asset`
- **THEN** the database rejects it via the CHECK constraint

### Requirement: Asset documents are hidden from document listings

Document listing queries SHALL exclude `kind = 'asset'` rows, replacing the previous
`metadata->>'asset'` flag filter. Assets remain readable/serviceable by id but MUST NOT appear in
the normal document lists surfaced to the web UI or the MCP list view.

#### Scenario: Asset excluded from listing
- **WHEN** `listDocuments` / `listDocumentsWithContent` runs for a knowledge base
- **THEN** documents with `kind = 'asset'` are omitted from the result

#### Scenario: Non-asset documents still listed
- **WHEN** the same listing runs
- **THEN** all `raw` and `wiki` documents are included

### Requirement: Raw-only fields live in a document_raw detail table

The system SHALL store raw-only processing/audit fields (`parser`, `error_message`, and
`page_count`) in a `document_raw` detail table keyed 1:1 by `document_id`
(`REFERENCES documents(id) ON DELETE CASCADE`), rather than on `documents`. `file_size` and `status`
SHALL remain on the base `documents` table. Creating or finalizing a raw document MUST write the base
row and its `document_raw` row within a single transaction.

#### Scenario: Raw detail row created with the raw document
- **WHEN** a binary source is finalized after extraction
- **THEN** a matching `document_raw` row exists carrying its `parser`, `error_message`, and `page_count`

#### Scenario: Reading raw fields joins the detail table
- **WHEN** a query needs a raw document's `parser` or `page_count`
- **THEN** it retrieves them by joining `document_raw` on `document_id`

#### Scenario: Deleting a document cascades its raw detail
- **WHEN** a `documents` row is deleted
- **THEN** its `document_raw` row is removed by the ON DELETE CASCADE

### Requirement: Browse views for sources and wiki pages

The system SHALL provide two read-only views: `sources` (projecting base columns joined with
`document_raw`, filtered to `kind = 'raw'`) and `wiki_pages` (projecting base columns relevant to
wiki pages, filtered to `kind = 'wiki'`). These views are for readability/ad-hoc querying; the
application data layer is NOT required to read through them.

#### Scenario: sources view returns only raw documents
- **WHEN** selecting from `sources`
- **THEN** only `kind = 'raw'` documents are returned, with their `document_raw` fields available

#### Scenario: wiki_pages view returns only wiki documents
- **WHEN** selecting from `wiki_pages`
- **THEN** only `kind = 'wiki'` documents are returned

### Requirement: Existing documents are backfilled on migration

The migration SHALL backfill `kind` for all pre-existing `documents` rows and create their
`document_raw` rows without data loss. Rows under `/wiki/` become `wiki`; all other rows (including
previously failed image uploads) become `raw`.

#### Scenario: Existing rows backfilled by path
- **WHEN** the kind migration runs against the existing data
- **THEN** every row has a non-null `kind` (`/wiki/%` → `wiki`, otherwise `raw`) and the total row count is unchanged

#### Scenario: Existing raw processing fields migrated
- **WHEN** the document_raw migration runs
- **THEN** each raw document's existing `parser`/`error_message`/`page_count` values are moved into `document_raw` with no loss
