## ADDED Requirements

### Requirement: Sign out

The web app SHALL let an authenticated user sign out from an account menu at the sidebar bottom.
Signing out MUST clear the Supabase session and return the user to the login page.

#### Scenario: User signs out
- **WHEN** the user chooses "Sign out" from the account menu
- **THEN** the session is cleared and the app navigates to `/login`

### Requirement: Account menu

The sidebar bottom SHALL show the signed-in account and, on click, open a menu offering Settings, a
Dark Mode toggle, and Sign out.

#### Scenario: Account menu opens
- **WHEN** the user clicks the account name
- **THEN** a menu with Settings, Dark Mode, and Sign out is shown

### Requirement: Dark mode

The app SHALL support a persisted light/dark theme toggle. Toggling MUST apply the theme immediately
(via a `.dark` class) and persist across reloads.

#### Scenario: Toggle dark mode
- **WHEN** the user toggles Dark Mode
- **THEN** the theme switches immediately and remains after reload

### Requirement: Settings page with API key management

The app SHALL provide a settings page reachable from the account menu. The settings page SHALL let the
user manage API keys — list, create (revealing a new `tkms_` token once), and revoke — using the
existing API-key endpoints, so the user can self-serve a token to connect MCP.

#### Scenario: Create an API key
- **WHEN** the user creates an API key in settings
- **THEN** a new `tkms_` token is shown once and the key appears in the list

#### Scenario: Revoke an API key
- **WHEN** the user revokes a key
- **THEN** the backend revokes it and it is removed from the active list
