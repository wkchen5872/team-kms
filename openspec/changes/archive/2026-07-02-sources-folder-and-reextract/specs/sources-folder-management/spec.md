## ADDED Requirements

### Requirement: Delete a folder and its contents
The system SHALL let a user delete a (virtual) Sources folder. Deletion SHALL recursively soft-delete (archive) every document whose path is under that folder's prefix, after an explicit confirmation showing how many documents will be removed. Writes SHALL use service-role scoped by `user_id`.

#### Scenario: delete a non-empty folder
- **WHEN** a user confirms deletion of a folder containing N documents
- **THEN** all N documents under that path prefix are archived (hidden from the grid)
- **AND** documents outside that prefix (including sibling folders) are untouched

#### Scenario: confirmation before delete
- **WHEN** a user chooses Delete on a folder
- **THEN** a confirmation is shown stating the number of documents that will be deleted before anything is archived

### Requirement: Rename a folder
The system SHALL let a user rename a Sources folder. Renaming SHALL rewrite the path prefix of every document under the old prefix to the new prefix (same parent level). Writes SHALL use service-role scoped by `user_id`.

#### Scenario: rename moves all descendants
- **WHEN** a user renames folder `/a/old/` to `/a/new/`
- **THEN** every document whose path started with `/a/old/` now has a path starting with `/a/new/`
- **AND** documents under other prefixes are unchanged

#### Scenario: rename collides with an existing folder
- **WHEN** the new folder name matches an existing folder at the same level (path uniqueness violation)
- **THEN** the operation fails with a 409 and the user is told to choose another name
