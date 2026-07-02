## ADDED Requirements

### Requirement: MCP read returns images on request
The MCP `read` tool SHALL accept an `include_images` boolean parameter. When true, for the requested document/pages it SHALL load the referenced image assets (from `document_pages.elements`) and return them as base64 image content blocks alongside the text, so Claude can visually interpret figures, charts, and flowcharts.

#### Scenario: read a PDF page with images, include_images=true
- **WHEN** Claude calls `read` on a page that has image assets with `include_images=true`
- **THEN** the response includes the page text AND base64 image blocks for that page's images

#### Scenario: default behavior unchanged
- **WHEN** `read` is called without `include_images` (or false)
- **THEN** only text is returned (images are not embedded), preserving current default behavior

#### Scenario: image count cap
- **WHEN** a read would return more than the inline image limit (12)
- **THEN** at most 12 images are embedded and the response indicates that images were capped

#### Scenario: directly uploaded image document
- **WHEN** Claude reads a document that is itself a raster image, with `include_images=true`
- **THEN** the image bytes are returned as a base64 image block (in addition to any OCR text)
