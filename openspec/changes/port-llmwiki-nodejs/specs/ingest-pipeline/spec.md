## ADDED Requirements

### Requirement: Unified ingest from upload to index
The system SHALL ingest a source file through a single pipeline: store to S3 → extract via the converter service → chunk → index into Postgres, after which the source is searchable and readable over MCP.

#### Scenario: PDF becomes searchable
- **WHEN** a user uploads a PDF and ingest completes
- **THEN** a `documents` row plus `document_chunks` exist and the content is returned by `search_chunks`

#### Scenario: Plain text skips conversion
- **WHEN** a `.md` or `.txt` file is ingested
- **THEN** it is indexed directly without calling the converter

### Requirement: Resumable upload
The system SHALL accept resumable uploads via the TUS protocol, validate file signatures (magic bytes), enforce a size cap, and finalize the upload by moving the object into S3 and marking the document pending.

#### Scenario: Resume after interruption
- **WHEN** an upload is interrupted and the client re-sends remaining chunks with the correct `Upload-Offset`
- **THEN** the server appends from that offset and finalizes the same upload

#### Scenario: Reject oversized or wrong-signature file
- **WHEN** an upload exceeds the size cap or its magic bytes do not match its declared type
- **THEN** the upload is rejected

### Requirement: Asynchronous extraction jobs with recovery
The system SHALL process extraction/OCR asynchronously, track document status (`pending → processing → ready|error`), and on startup re-enqueue documents left in `pending`/`processing`.

#### Scenario: Stuck job recovered on restart
- **WHEN** the API restarts while a document is `processing`
- **THEN** that document is re-enqueued for extraction

### Requirement: Real-time change notifications
The system SHALL emit document change events via Postgres LISTEN/NOTIFY and relay them to connected web clients over WebSocket.

#### Scenario: Client notified of new document
- **WHEN** a document row is inserted for a KB a client is subscribed to
- **THEN** the client receives a change event over its WebSocket
