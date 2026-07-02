## ADDED Requirements

### Requirement: PDF-embedded image extraction
The converter SHALL extract images embedded in PDFs as raw bytes by invoking opendataloader with `imageOutput: "embedded"`, and SHALL return, per page, both the markdown text and a list of extracted images (id, base64 bytes, format) plus structured page elements.

#### Scenario: PDF page with an embedded image
- **WHEN** a PDF containing an embedded image is extracted
- **THEN** the converter response includes that page's image as `{ id, dataBase64, format }`
- **AND** the page markdown references the image via a resolvable element (not a bare `source_images/...` path pointing at a deleted temp dir)

#### Scenario: PDF page with no images
- **WHEN** a PDF page has no embedded images
- **THEN** that page's images list is empty and its `elements` carries no `images` entry

#### Scenario: oversized or too many images on a page
- **WHEN** an extracted image exceeds the configured per-image size cap, or a page exceeds the per-page image count cap
- **THEN** the converter SHALL skip the excess image(s) and include a warning in the response rather than silently truncating

### Requirement: Image assets stored in Supabase Storage
The ingest orchestrator SHALL persist each extracted image as an asset document: a `documents` row with `kind='asset'`, `metadata.hidden=true`, and `metadata.parent_document_id` set to the source document, with the image bytes uploaded to Supabase Storage under `{userId}/{assetDocId}/source.{format}`.

#### Scenario: PDF with images is ingested
- **WHEN** a PDF whose extraction yielded N images is finalized
- **THEN** N asset documents are created, each linked to the parent via `parent_document_id`
- **AND** each image's bytes are retrievable from Supabase Storage at its asset key

#### Scenario: duplicate image bytes
- **WHEN** the same image bytes are extracted more than once (e.g. repeated logo, re-ingest)
- **THEN** ingestion SHALL dedup by per-asset `file_hash` and not create redundant asset rows

### Requirement: Page elements and markdown link rewriting
The ingest orchestrator SHALL populate `document_pages.elements` with the page's image references as `{"images":[{id, src, filename}]}`, and SHALL rewrite the page markdown image links to point at the stored asset path rather than the raw opendataloader source.

#### Scenario: elements populated for an image page
- **WHEN** a page with images is stored
- **THEN** `document_pages.elements` for that page contains an `images` array whose entries carry the asset document id, a stable `src`, and the filename
- **AND** the stored page `content` markdown references those assets (no dangling `source_images/...` links)

### Requirement: Direct image upload branch
The ingest orchestrator SHALL handle directly uploaded raster images (png, jpg, jpeg, webp, gif) through a dedicated branch that bypasses the PDF/Office converter, storing the file as an asset and converging the document to `ready`.

#### Scenario: user uploads a JPG
- **WHEN** a user uploads a `.jpg` file
- **THEN** the document is stored (bytes in Supabase Storage) without being sent to the converter
- **AND** the document status becomes `ready` (it is not left `pending` nor marked `failed` by an unsupported-extension converter error)

#### Scenario: previously broken image upload no longer fails
- **WHEN** any supported raster image is uploaded
- **THEN** the ingest does not call `converter.extract` for that file and does not raise an "Unsupported extension" error
