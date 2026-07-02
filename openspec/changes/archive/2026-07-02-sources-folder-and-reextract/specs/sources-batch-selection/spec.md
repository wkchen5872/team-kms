## ADDED Requirements

### Requirement: Multi-select documents in Sources
The Sources file grid SHALL let a user select multiple documents. A checkbox SHALL appear on a document card on hover; clicking it (or cmd/ctrl-click, or shift-click for a range) toggles selection. Selected cards SHALL be visually highlighted. When nothing is selected, clicking a card opens it as before.

#### Scenario: select several files
- **WHEN** a user hovers a card and clicks its checkbox, then shift-clicks another card
- **THEN** the range of cards between them is selected and highlighted
- **AND** an action bar appears showing the selected count

#### Scenario: clear selection
- **WHEN** a user presses Escape or clears the selection
- **THEN** all cards are deselected and the action bar hides

### Requirement: Batch actions on selected documents
The selection action bar SHALL offer Delete and Re-extract for the current selection. Batch delete SHALL archive all selected documents; batch re-extract SHALL re-extract the extractable ones. Both report partial failures without aborting the rest.

#### Scenario: batch delete
- **WHEN** a user selects 3 documents and chooses Delete
- **THEN** all 3 are archived and removed from the grid (failures surfaced, successes removed)

#### Scenario: batch re-extract
- **WHEN** a user selects several documents and chooses Re-extract
- **THEN** the extractable ones are re-queued (returning to processing) and non-extractable ones are skipped
