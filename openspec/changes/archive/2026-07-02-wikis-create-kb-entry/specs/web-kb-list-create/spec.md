## ADDED Requirements

### Requirement: Create a knowledge base from the list page
The `/wikis` list page SHALL provide a control to create a knowledge base, so a user with zero knowledge bases can create their first one without needing to already be inside a workspace. On success it SHALL navigate to the new knowledge base's workspace.

#### Scenario: create the first knowledge base from empty state
- **WHEN** a user with no knowledge bases opens `/wikis`
- **THEN** an empty-state "Create your first knowledge base" action is shown
- **AND** submitting a name creates the KB and navigates to `/wikis/<slug>`

#### Scenario: create another knowledge base
- **WHEN** a user with existing knowledge bases clicks "New" and submits a name
- **THEN** the KB is created and the user lands in its workspace

#### Scenario: creation failure surfaces an error
- **WHEN** creation fails (e.g. duplicate name → 409)
- **THEN** an error toast is shown and the user stays on the list page
