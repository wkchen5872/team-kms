## ADDED Requirements

### Requirement: Three services deploy to Cloud Run

The system SHALL deploy `web`, `api`, and `converter` as three independent
Cloud Run services built from the existing Dockerfiles. `mcp` SHALL NOT be
deployed. The local `docker-compose.yml` SHALL remain unchanged.

#### Scenario: All three services reachable
- **WHEN** the deploy completes
- **THEN** `web`, `api`, and `converter` each have a running Cloud Run revision
- **AND** `web` serves an HTTPS URL that loads the app

#### Scenario: mcp and compose untouched
- **WHEN** the deploy completes
- **THEN** no `mcp` Cloud Run service exists
- **AND** `docker-compose.yml` has no diff

### Requirement: Converter sized for LibreOffice/JVM

The `converter` service SHALL be provisioned with enough memory and warm
capacity to run LibreOffice + JVM conversions, given Cloud Run's `/tmp` is
memory-backed.

#### Scenario: Office file converts on Cloud Run
- **WHEN** a supported Office/PDF file is sent to the deployed converter
- **THEN** it converts without out-of-memory or cold-start timeout
- **AND** the service is configured with `--memory 2Gi` (or higher) and
  `--min-instances 1`

### Requirement: Service-to-service wiring is private and authenticated

The `api` service SHALL reach `converter` via its Cloud Run URL using the shared
`CONVERTER_SECRET`, and `converter` SHALL NOT be publicly invocable.

#### Scenario: api calls converter
- **WHEN** `api` needs a conversion
- **THEN** it calls `CONVERTER_URL` (converter's Cloud Run URL) with the bearer
  secret
- **AND** `converter` is deployed with internal ingress

### Requirement: WebSocket connections survive on api

The `api` service SHALL keep a client's WebSocket bound to one instance so the
per-instance notify fan-out delivers `document_changes` events.

#### Scenario: Upload notification reaches the client
- **WHEN** a client holds a WebSocket to `api` and a `document_changes` NOTIFY fires
- **THEN** the client receives the event
- **AND** `api` is deployed with `--session-affinity`
