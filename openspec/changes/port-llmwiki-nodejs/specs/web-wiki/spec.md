## ADDED Requirements

### Requirement: Authenticated web access
The web app SHALL authenticate users via Supabase Auth and gate the dashboard behind a valid session.

#### Scenario: Unauthenticated user redirected to login
- **WHEN** a signed-out user opens a dashboard route
- **THEN** they are redirected to the login page

#### Scenario: Signed-in user reaches dashboard
- **WHEN** a user signs in successfully
- **THEN** they land on their knowledge base list

### Requirement: Knowledge base and document browsing
The web app SHALL list a user's knowledge bases and let them browse wiki pages and source files within a KB via tree navigation and breadcrumbs.

#### Scenario: Browse to a wiki page
- **WHEN** a user selects a KB and navigates to a wiki page path
- **THEN** the page content renders (markdown, with mermaid diagrams supported)

#### Scenario: View a source document
- **WHEN** a user opens a PDF or markdown source
- **THEN** it renders in the corresponding viewer

### Requirement: No highlight or extension features
The web app SHALL NOT include highlight/annotation UI, the Chrome-extension OAuth consent flow, KB public-sharing UI, or marketing/legal pages.

#### Scenario: Highlights absent
- **WHEN** a source document is viewed
- **THEN** no highlight creation, rendering, or annotation controls are present

### Requirement: Knowledge graph visualization
The web app SHALL render a knowledge graph of the KB's documents and reference edges using a force-directed graph, sourced from the API graph endpoint, with focus mode and a rebuild action.

#### Scenario: Graph renders nodes and edges
- **WHEN** a user opens the graph tab for a KB
- **THEN** documents render as nodes and `cites`/`links_to` references render as edges

#### Scenario: Clicking a node navigates
- **WHEN** a user clicks a graph node
- **THEN** the app navigates to that document

### Requirement: Backend communication
The web app SHALL read and write data through the api REST endpoints (Bearer-authenticated) and use the Supabase client for auth, with the MCP server reachable separately by Claude.

#### Scenario: Graph data fetched from API
- **WHEN** the graph view loads
- **THEN** it fetches nodes/edges from the API graph endpoint with the user's bearer token
