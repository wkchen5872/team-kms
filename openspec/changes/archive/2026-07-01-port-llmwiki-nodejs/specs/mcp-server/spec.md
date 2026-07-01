## ADDED Requirements

### Requirement: Hosted MCP server with authenticated transport
The system SHALL expose an MCP server over HTTP/SSE using `@modelcontextprotocol/sdk`, authenticated with Supabase JWTs, so any MCP-compatible client (Claude Code, claude.ai) can connect as a specific user.

#### Scenario: Authenticated connection scoped to user
- **WHEN** a client connects with a valid Supabase access token
- **THEN** the server resolves the user from the token and scopes all tool calls to that user's knowledge bases

#### Scenario: Reject missing or invalid token
- **WHEN** a client connects without a valid token
- **THEN** the connection is rejected and no tools are exposed

### Requirement: Knowledge base discovery tools
The MCP server SHALL provide `guide`, `list_knowledge_bases`, and `create_knowledge_base` tools.

#### Scenario: Guide orients the model
- **WHEN** the `guide` tool is called
- **THEN** it returns help text plus the caller's knowledge bases

### Requirement: Read tools (search and read)
The MCP server SHALL provide a `search` tool with three modes (list documents, keyword search chunks, query references) and a `read` tool that reads a single file or a glob batch, supports PDF page ranges, and can embed images.

#### Scenario: Search keyword mode
- **WHEN** `search(knowledge_base, mode="search", query=...)` is called
- **THEN** it returns formatted matching chunks with their source paths

#### Scenario: Read with page range
- **WHEN** `read(knowledge_base, path, pages="2-4")` is called on a PDF
- **THEN** it returns the content for pages 2 through 4

### Requirement: Write tools (create, edit, append)
The MCP server SHALL let Claude author wiki pages via `create` (with frontmatter), `edit` (string replace), and `append`, and SHALL protect `wiki/overview.md` and `wiki/log.md` from deletion.

#### Scenario: Create wiki page enforces frontmatter
- **WHEN** `create(path, title, content, ...)` is called
- **THEN** the new wiki document is stored with valid frontmatter and its referenced pages are reported back as impact surface

#### Scenario: Edit performs in-place replacement
- **WHEN** `edit(path, old_text, new_text)` is called and `old_text` is unique in the document
- **THEN** only that occurrence is replaced and the document is re-chunked

### Requirement: Reference graph updates on write
On every write tool, the MCP server SHALL parse citations and wiki links from the content and update the document reference graph accordingly.

#### Scenario: Wiki link creates an edge
- **WHEN** a wiki page is created containing a link to another page
- **THEN** a `links_to` reference edge is recorded from the page to its target

### Requirement: Delete and lint tools
The MCP server SHALL provide a `delete` tool (single or glob, respecting protected pages) and a deterministic `lint` tool checking frontmatter completeness, footnote/citation resolution, dangling wiki links, orphan pages, uncited sources, and stale pages.

#### Scenario: Lint reports broken wiki link
- **WHEN** `lint` runs over a KB containing a wiki link to a non-existent page
- **THEN** the broken link is reported as an issue

#### Scenario: Delete protects core pages
- **WHEN** `delete` targets `wiki/overview.md`
- **THEN** the page is not deleted and is reported as protected
