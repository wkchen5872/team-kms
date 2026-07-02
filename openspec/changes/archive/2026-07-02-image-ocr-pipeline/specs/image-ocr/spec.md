## ADDED Requirements

### Requirement: Pluggable OCR provider interface
The system SHALL define an `OcrProvider` interface (`ocrImage(bytes, mime) → { text }`) with at least two implementations, Mistral and Gemini, selected at runtime by configuration (e.g. `OCR_PROVIDER=gemini|mistral|none`). Provider-specific response shapes SHALL be normalized inside each implementation.

#### Scenario: provider selected by config
- **WHEN** `OCR_PROVIDER=gemini` and a Gemini API key are configured
- **THEN** image OCR calls are routed to the Gemini implementation
- **AND** switching `OCR_PROVIDER=mistral` routes them to the Mistral implementation without other code changes

#### Scenario: OCR disabled
- **WHEN** `OCR_PROVIDER=none` (or no provider/key configured)
- **THEN** no OCR is performed and images are still stored as assets (backend makes zero LLM calls)

### Requirement: OCR runs at ingest on extracted images
The ingest orchestrator SHALL run the configured OCR provider on each stored image (both PDF-extracted and directly uploaded) to extract text/description, and SHALL include that text in the searchable index so image-borne content (tables, flowcharts) is findable.

#### Scenario: table image is OCR'd and searchable
- **WHEN** an image containing a table is ingested with an OCR provider configured
- **THEN** the extracted text is stored with the image asset and indexed
- **AND** a content search for a term appearing only inside that table returns the parent document

#### Scenario: OCR text attached to the right page
- **WHEN** OCR text is produced for an image on page P
- **THEN** the text is associated with page P's content so search results locate the correct page

### Requirement: OCR failure degrades gracefully
OCR failures (rate limit, provider outage, timeout) SHALL NOT fail the document ingest. The image SHALL still be stored as an asset and the document SHALL still converge to `ready`; the OCR error SHALL be recorded for later retry.

#### Scenario: provider returns an error
- **WHEN** the OCR provider errors while processing an image
- **THEN** the image asset is still created and the document status still becomes `ready`
- **AND** the failure is recorded (not raised as a hard ingest failure)
