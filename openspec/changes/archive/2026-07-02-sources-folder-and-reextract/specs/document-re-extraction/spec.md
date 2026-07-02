## ADDED Requirements

### Requirement: Re-extract an existing document
The system SHALL provide `POST /v1/documents/:id/re-extract` that re-runs extraction/OCR on an already-uploaded document without re-uploading. It SHALL reset the document to `pending` and enqueue it for the extraction queue, which re-reads the persisted S3 source and rebuilds pages/chunks. It SHALL be restricted to extractable types (pdf, pptx, ppt, docx, doc, xls, xlsx, png, jpg, jpeg, webp, gif).

#### Scenario: re-extract a PDF
- **WHEN** re-extract is called on a ready PDF document
- **THEN** the document returns to `pending` → `processing` and its pages/chunks are rebuilt from the stored source
- **AND** its status returns to `ready` (or `failed` if extraction errors), with no re-upload required

#### Scenario: re-extract an image re-runs OCR
- **WHEN** re-extract is called on an image document and an OCR provider is configured
- **THEN** OCR is re-run on the stored image and the searchable text is refreshed

#### Scenario: re-extract rejected for non-extractable types
- **WHEN** re-extract is called on a `md` or `txt` note
- **THEN** the request is rejected with a 400 (nothing to extract)

### Requirement: Batch re-extract
The system SHALL let a user re-extract multiple selected documents at once. Batch re-extract MAY be performed as independent per-document calls; non-extractable selections SHALL be skipped. The single-threaded extraction queue processes them one at a time.

#### Scenario: re-extract a mixed selection
- **WHEN** a user batch-re-extracts a selection containing PDFs and a text note
- **THEN** each extractable document is re-extracted and the text note is skipped
- **AND** a partial failure in one document does not abort the others
