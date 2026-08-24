# batch-folder-upload

<!-- Synced from change add-folder-batch-upload -->

## Purpose

Enable users to import many source files from the web UI while preserving intentional directory organization, detecting conflicts before transfer, and reporting the outcome as one manageable batch.

## Requirements

### Requirement: Users can select multiple source files
The system SHALL allow a user to select multiple supported source files and upload them to the currently open Team KMS folder as one batch.

#### Scenario: Upload multiple files to the current folder
- **WHEN** a user selects multiple supported files while viewing a Team KMS folder
- **THEN** the system uploads every non-conflicting file to that folder
- **AND** each resulting source document records that folder as its path

### Requirement: Users can select a local directory
The system SHALL provide a directory-selection action that recursively discovers files within one selected local directory.

#### Scenario: Select a nested directory
- **WHEN** a user chooses a local directory containing files in multiple nested directories
- **THEN** the system includes all supported descendant files in a preflight review
- **AND** the selected directory itself acts as the import root

#### Scenario: Directory selection is unavailable
- **WHEN** the user's browser cannot provide directory selection
- **THEN** the system keeps multi-file selection available
- **AND** it explains that directory selection is unavailable in that browser

### Requirement: Users choose how directory paths are mapped
Before a directory batch starts, the system SHALL ask whether to preserve the selected directory's relative structure or flatten all files into the currently open Team KMS folder. Preserving structure SHALL be the default.

#### Scenario: Preserve relative directory structure
- **WHEN** the user selects the preserve-structure option
- **THEN** each file's destination is the current Team KMS folder plus its parent path relative to the selected import root
- **AND** the system does not add the selected import-root directory name as an extra path segment

#### Scenario: Flatten directory structure
- **WHEN** the user selects the flatten option
- **THEN** every selected file targets the currently open Team KMS folder regardless of its original parent directory

### Requirement: Every batch is reviewed before transfer
The system SHALL display a preflight summary before transferring a multi-file or directory batch. The summary MUST include total discovered files, files eligible for upload, unsupported files, and destination conflicts.

#### Scenario: Batch contains unsupported files
- **WHEN** selected files include types the server cannot ingest
- **THEN** the preflight identifies those files as unsupported
- **AND** the system excludes them from transfer

#### Scenario: User cancels preflight
- **WHEN** the user cancels from the preflight review
- **THEN** the system starts no uploads from that batch

### Requirement: Destination conflicts are not destructive
The system SHALL detect files that resolve to an existing destination path and filename, as well as files within the selected batch that resolve to the same destination. Conflicting files SHALL be skipped without overwriting or automatic renaming.

#### Scenario: Existing document conflicts with selected file
- **WHEN** a selected file resolves to the path and filename of an existing active document
- **THEN** the preflight marks the selected file as conflicting
- **AND** the system does not upload or alter either file

#### Scenario: Flattening creates an internal filename conflict
- **WHEN** files from different source directories resolve to the same destination after flattening
- **THEN** the preflight marks all affected files as conflicting
- **AND** the user can switch to preserved structure or continue with those files skipped

#### Scenario: Conflict appears after preflight
- **WHEN** another operation creates a destination conflict after preflight but before upload finalization
- **THEN** the server rejects the conflicting file without overwriting the existing document
- **AND** the batch result reports that file as failed or skipped due to conflict

### Requirement: Uploaded files retain their resolved destination paths
The resumable-upload flow SHALL carry the resolved destination path through upload creation and source ingestion. The server MUST reject invalid paths that escape or ambiguously address the knowledge-base namespace.

#### Scenario: Binary file targets a nested folder
- **WHEN** a supported binary file is uploaded with a valid nested destination path
- **THEN** the resulting source document is created at that exact normalized path

#### Scenario: Upload path is invalid
- **WHEN** upload metadata contains traversal segments or an invalid destination path
- **THEN** the server rejects the upload without creating a document

### Requirement: Distinct selected files are not silently deduplicated by content
The system SHALL create a source document for every non-conflicting selected path and filename even when two selected files contain identical bytes.

#### Scenario: Identical content has different destinations
- **WHEN** two selected files contain identical bytes but resolve to different destination paths or filenames
- **THEN** both source documents are created at their respective destinations

### Requirement: Batch transfers are bounded and observable
The system SHALL limit simultaneous file transfers and SHALL present aggregate batch progress without requiring one notification per file.

#### Scenario: Large directory batch uploads
- **WHEN** a user starts a batch containing many eligible files
- **THEN** the system transfers only a bounded number concurrently
- **AND** queued files remain visible as part of the same batch

#### Scenario: Batch is in progress
- **WHEN** one or more files are queued, uploading, or processing
- **THEN** the UI shows completed and total file counts together with aggregate progress

#### Scenario: Batch completes with failures
- **WHEN** all eligible transfers finish and one or more files failed
- **THEN** the UI reports the completed, skipped, and failed counts
- **AND** the user can inspect the affected filenames and reasons
