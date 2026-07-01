## ADDED Requirements

### Requirement: Supabase JWT verification
The api and mcp services SHALL authenticate requests by verifying Supabase-issued JWTs against the project's JWKS, checking issuer, audience, and expiry, and extracting the user id (`sub`).

#### Scenario: Valid token resolves user
- **WHEN** a request carries a valid Supabase access token
- **THEN** the service resolves the user id from the verified `sub` claim

#### Scenario: Expired or wrong-audience token rejected
- **WHEN** a token is expired, has the wrong audience, or fails signature verification
- **THEN** the request is rejected as unauthenticated

### Requirement: Row-Level Security enforcement
Database access on behalf of a user SHALL run with the `authenticated` role and the request's JWT claims set via `set_config('request.jwt.claims', ...)`, so Postgres RLS isolates each user's data.

#### Scenario: User cannot read another user's KB
- **WHEN** user A issues a scoped query for user B's knowledge base
- **THEN** RLS returns no rows

#### Scenario: Scoped writes carry claims
- **WHEN** a scoped insert/update runs for a user
- **THEN** the JWT claims are applied for that statement so RLS write policies are enforced

### Requirement: Service-role operations bypass RLS deliberately
System operations that must cross users (e.g. async job recovery, LISTEN/NOTIFY relay) SHALL use an explicit service-role path that bypasses RLS, separate from user-scoped queries.

#### Scenario: Job recovery uses service role
- **WHEN** startup recovery scans for stuck documents across users
- **THEN** it uses the service-role query path rather than a user-scoped one

### Requirement: API key authentication
The system SHALL support API keys for programmatic access, stored as hashes and resolvable to a user.

#### Scenario: Valid API key authenticates
- **WHEN** a request presents a valid API key
- **THEN** it is resolved to its owning user and scoped accordingly
