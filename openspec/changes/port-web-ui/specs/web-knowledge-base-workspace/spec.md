## ADDED Requirements

### Requirement: Knowledge base workspace shell

The web app SHALL present a knowledge base as a two-region workspace: a left sidebar and a main
content region. The main region SHALL switch between three views — files, graph, and wiki content —
driven by the URL under a single `wikis/[slug]/[[...path]]` route (covering `/wikis/:slug`,
`/wikis/:slug/files/...`, and `/wikis/:slug/graph`).

#### Scenario: Opening a knowledge base shows the shell
- **WHEN** an authenticated user navigates to `/wikis/:slug`
- **THEN** the sidebar and main content region render, defaulting to the wiki overview

#### Scenario: URL selects the active view
- **WHEN** the user switches to sources or graph
- **THEN** the URL updates to `/wikis/:slug/files/...` or `/wikis/:slug/graph` and reloading that URL restores the same view

### Requirement: Knowledge base switcher

The sidebar SHALL provide a knowledge base switcher (dropdown on the KB name) that lets the user
list all their knowledge bases, create a new one, rename the current one, delete the current one, and
switch to another. Rename and delete MUST call the backend and reflect the result.

#### Scenario: Create a knowledge base
- **WHEN** the user chooses "Create wiki" and confirms a name
- **THEN** a new knowledge base is created via the API and the app navigates to it

#### Scenario: Rename a knowledge base
- **WHEN** the user renames the current knowledge base
- **THEN** the API updates its name and the sidebar reflects the new name

#### Scenario: Delete a knowledge base
- **WHEN** the user deletes the current knowledge base and confirms
- **THEN** the API deletes it (cascading its documents) and the app navigates back to the wiki list

### Requirement: Sidebar wiki tree and sources list

The sidebar SHALL render wiki pages (documents under `/wiki/`) as an expandable file tree reflecting
their nested paths, and render source documents as a list. Clicking an entry SHALL load that document
into the main region.

#### Scenario: Wiki pages render as a nested tree
- **WHEN** the knowledge base has wiki pages at nested paths (e.g. `/wiki/concepts/x.md`)
- **THEN** the sidebar shows an expandable folder tree and the active page is highlighted

#### Scenario: Selecting a document loads it
- **WHEN** the user clicks a wiki page or source in the sidebar
- **THEN** the main region loads that document's content
