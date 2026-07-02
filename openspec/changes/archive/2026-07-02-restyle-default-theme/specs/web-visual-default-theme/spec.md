## ADDED Requirements

### Requirement: Light palette matches the default design
The web app's light theme SHALL adopt the `docs/design/default` palette (slate background, white cards, navy ink, slate muted text, light borders, blue accent, 12px radius) via the existing `:root` CSS variables. The `.dark` theme SHALL remain unchanged, except that any newly introduced status tokens (success/warning) SHALL also be defined for dark.

#### Scenario: light theme reflects the design palette
- **WHEN** the app is viewed in light mode
- **THEN** background/cards/text/borders/accent match the default design tokens (e.g. slate bg, blue accent) and radius is ~12px

#### Scenario: dark theme is preserved
- **WHEN** the app is viewed in dark mode
- **THEN** the existing dark appearance is intact (no regression), and status colors render (success/warning defined for dark)

### Requirement: Screens aligned to the default design layout
The wikis list, files/sources, settings, and wiki reading screens SHALL be aligned to the default design's structure and motifs (eyebrow labels, status indicators, file-type pills, card styling, bilingual section headers) while preserving existing functionality.

#### Scenario: wikis list is a dashboard
- **WHEN** viewing `/wikis`
- **THEN** it shows a header (bilingual title + system status) and KB cards with eyebrow, accent title, slug and a READY status indicator, plus the create entry

#### Scenario: files grid shows type pills and colored icons
- **WHEN** viewing a KB's sources
- **THEN** each file card shows a type pill (e.g. MD/PDF/DOCX), a size label, and an icon colored by file type; processing files indicate an extracting state

#### Scenario: settings uses the design panel
- **WHEN** viewing `/settings`
- **THEN** it shows a panel with numbered bilingual section headers (Appearance, API Keys); the appearance control still toggles the existing light/dark (no new theme is introduced)

### Requirement: No theme switcher or ctc in scope
This change SHALL NOT add a named-theme switcher or the ctc theme. The only appearance control remains the existing light/dark toggle.

#### Scenario: only light/dark exists
- **WHEN** a user opens appearance settings
- **THEN** the only option is toggling light/dark; no ctc or multi-theme picker is present
