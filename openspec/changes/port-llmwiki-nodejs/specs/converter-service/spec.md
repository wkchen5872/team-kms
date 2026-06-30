## ADDED Requirements

### Requirement: Node converter extraction endpoint
The system SHALL provide a Node converter service exposing `POST /extract` that accepts an S3 source URL plus file extension and returns per-page markdown. The endpoint SHALL require a shared bearer secret.

#### Scenario: Extract returns per-page markdown
- **WHEN** `/extract` is called with a valid bearer secret and a supported source
- **THEN** it returns `{ pages: [{ page, content }], page_count }`

#### Scenario: Reject without secret
- **WHEN** `/extract` is called without the correct bearer secret
- **THEN** it responds 401 and does not download or process the source

### Requirement: SSRF-safe source fetching
The converter SHALL only fetch sources from the configured S3 bucket/host and SHALL cap downloaded bytes.

#### Scenario: Reject non-bucket URL
- **WHEN** `/extract` is given a URL that does not point to the configured S3 bucket
- **THEN** the request is rejected before any download

#### Scenario: Cap oversized download
- **WHEN** the source exceeds the maximum byte cap mid-stream
- **THEN** the download aborts with an error

### Requirement: Office and PDF extraction via external engines
The converter SHALL convert Office files (doc/docx/ppt/pptx) to PDF using the LibreOffice binary, then extract structured content from PDF using the opendataloader Java CLI, and assemble JSON elements into markdown. This SHALL preserve the extraction engines used by the original Python service.

#### Scenario: Office file converted then extracted
- **WHEN** a `.docx` is submitted
- **THEN** LibreOffice converts it to PDF and opendataloader extracts per-page markdown

#### Scenario: JSON elements become markdown
- **WHEN** opendataloader returns heading/paragraph/list/image/caption elements
- **THEN** they are rendered to the corresponding markdown, excluding header/footer elements

### Requirement: Bounded execution
The converter SHALL enforce per-step timeouts (kill the child process group on timeout) and cap concurrent extraction jobs, rejecting excess jobs.

#### Scenario: Timeout kills subprocess
- **WHEN** LibreOffice or opendataloader exceeds its timeout
- **THEN** its process group is killed and the request fails with a timeout error

#### Scenario: Reject at capacity
- **WHEN** the number of in-flight extractions is at the configured cap
- **THEN** a new `/extract` request is rejected with a retryable error
