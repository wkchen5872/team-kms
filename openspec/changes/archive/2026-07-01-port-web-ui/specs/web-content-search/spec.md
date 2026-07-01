## ADDED Requirements

### Requirement: Backend content search endpoint

The API SHALL expose a search endpoint (`GET /v1/knowledge-bases/:slug/search?q=&limit=`) that wraps
the existing `searchChunks` full-text search and returns matching chunks with their source document
metadata, scoped to the authenticated user's knowledge base.

#### Scenario: Search returns matching chunks
- **WHEN** the endpoint is called with a query that matches indexed content
- **THEN** it returns the matching chunks with `filename`, `title`, `path`, and score

#### Scenario: Search is scoped to the user
- **WHEN** a user searches a knowledge base they do not own
- **THEN** no results from that knowledge base are returned

### Requirement: Sidebar search palette

The sidebar SHALL provide a search palette (opened via a button and the Cmd+K shortcut) that filters
the knowledge base's wiki pages and sources as the user types, and navigates to the chosen result.

#### Scenario: Palette filters as you type
- **WHEN** the user opens the palette and types
- **THEN** the list narrows to documents whose title/path/tags/type match

#### Scenario: Selecting a result navigates
- **WHEN** the user selects a result
- **THEN** the workspace loads that document
