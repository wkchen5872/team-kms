## ADDED Requirements

### Requirement: Postgres-only storage backend
The system SHALL implement a single VaultFS storage abstraction backed by Postgres (metadata, content, chunks, references) and S3 (binary assets). The system SHALL NOT include any SQLite or local-filesystem storage backend.

#### Scenario: VaultFS resolves against Postgres
- **WHEN** any service constructs a VaultFS for a user
- **THEN** all reads and writes go to Postgres (+ S3 for binary bytes), and no SQLite connection or local workspace path is created

#### Scenario: No SQLite backend present
- **WHEN** the codebase is inspected for storage backends
- **THEN** there is exactly one VaultFS implementation (Postgres) and no `sqlite` vaultfs/db/storage modules exist

### Requirement: Knowledge base operations
The VaultFS SHALL resolve a knowledge base by slug, list a user's knowledge bases, and create a knowledge base scaffolded with initial `overview.md` and `log.md` wiki pages.

#### Scenario: Resolve KB by slug
- **WHEN** `resolve_kb(slug)` is called with a slug owned by the user
- **THEN** it returns the KB record; for an unknown or unauthorized slug it returns null

#### Scenario: Create KB with scaffold
- **WHEN** `create_knowledge_base(name, description, kind)` is called
- **THEN** a KB row is created and seeded with `wiki/overview.md` and `wiki/log.md` documents

### Requirement: Document lifecycle
The VaultFS SHALL create, read, update, list, and archive documents (both source files and wiki pages), including per-page content for paginated sources.

#### Scenario: Create document and chunk it
- **WHEN** `create_document(...)` is called with content
- **THEN** a `documents` row is created and its content is chunked into `document_chunks`

#### Scenario: Update re-chunks content
- **WHEN** `update_document(doc_id, content=...)` changes content
- **THEN** the document's chunks are regenerated to match the new content

#### Scenario: Archive hides documents
- **WHEN** `archive_documents([doc_ids])` is called
- **THEN** those documents are marked archived and excluded from default listings

### Requirement: Full-text chunk search
The VaultFS SHALL search chunks within a knowledge base using Postgres PGroonga full-text matching, supporting path filter and result limit.

#### Scenario: Keyword search returns ranked chunks
- **WHEN** `search_chunks(kb_id, query, limit)` is called with a query that matches indexed content
- **THEN** it returns up to `limit` matching chunks ordered by relevance, each carrying its document path and page

### Requirement: Reference graph maintenance
The VaultFS SHALL store directed references between documents (`cites`, `links_to`) and expose backlinks, forward references, uncited sources, and stale pages.

#### Scenario: Upsert and read references
- **WHEN** `upsert_reference(source, target, kb, type, page)` is called then `get_backlinks(target)`
- **THEN** the source document appears in the target's backlinks

#### Scenario: Staleness propagation
- **WHEN** a source document a wiki page cites is updated and `propagate_staleness(doc_id)` runs
- **THEN** wiki pages referencing it are reported by `find_stale_pages(kb_id)`

### Requirement: Binary asset loading from S3
The VaultFS SHALL load source bytes, page images, and extracted asset bytes from S3.

#### Scenario: Load source bytes
- **WHEN** `load_source_bytes(doc)` is called for a document with an S3 key
- **THEN** the object bytes are streamed back from S3
