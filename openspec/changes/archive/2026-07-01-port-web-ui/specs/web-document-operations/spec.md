## ADDED Requirements

### Requirement: File grid with type icons and sorting

When viewing sources, the main region SHALL display documents as a grid of cards, each showing an
icon chosen by `file_type` (e.g. pdf, image, spreadsheet, presentation, markdown). The grid SHALL be
sortable by name, modified time, and file type, with a direction toggle. Documents of `kind = 'asset'`
MUST NOT appear.

#### Scenario: Icons reflect file type
- **WHEN** the sources grid renders documents of varying `file_type`
- **THEN** each card shows the icon mapped to its type

#### Scenario: Sorting reorders the grid
- **WHEN** the user selects a sort field (name / modified / type) and toggles direction
- **THEN** the grid reorders accordingly

### Requirement: Create folders and notes

The user SHALL be able to create a folder (directory) and a note within the current path via the web.
Creating either MUST call the backend note/folder endpoint and add the result to the document list.

#### Scenario: Create a folder
- **WHEN** the user creates a new folder with a name in the current path
- **THEN** the backend creates it at `path = <current>/<name>/` and it appears in the grid

#### Scenario: Create and edit a note
- **WHEN** the user creates a note and edits its markdown content
- **THEN** the content is persisted via the backend (plain textarea editor; no rich-text editor)

### Requirement: Move and delete documents

The user SHALL be able to move a document to another path and delete a document from the web. Delete
MUST soft-delete (archive) via the backend and remove it from the listing. Multi-select delete SHALL
be supported.

#### Scenario: Delete a document
- **WHEN** the user deletes a document
- **THEN** the backend archives it and it disappears from the grid/sidebar

#### Scenario: Move a document
- **WHEN** the user moves a document into a folder
- **THEN** the backend updates its `path` and the sidebar/grid reflect the new location

### Requirement: Upload documents

The user SHALL be able to upload source files from the web, which are ingested by the backend and
appear in the list once processed.

#### Scenario: Upload a source file
- **WHEN** the user uploads a PDF
- **THEN** it is ingested (via the resumable/multipart upload path) and appears, transitioning to a ready state

### Requirement: Graph node navigation

The graph view SHALL render the reference graph and, on clicking a node, navigate to that node's
document (wiki page or source) within the workspace. It MUST NOT throw when a node's `path` is null.

#### Scenario: Clicking a graph node navigates
- **WHEN** the user clicks a node in the graph
- **THEN** the workspace navigates to that document (fixing the current click error)

#### Scenario: Null path does not crash
- **WHEN** a node has a null/undefined path
- **THEN** the graph still renders without throwing
