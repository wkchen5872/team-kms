/**
 * Postgres connection pool with two access paths, ported from llmwiki
 * `mcp/db.py`:
 *
 *  - scoped*  — runs inside a transaction as the `authenticated` role with the
 *               request's JWT claims set via `set_config('request.jwt.claims')`,
 *               so Postgres RLS isolates each user's data. `SET LOCAL` resets at
 *               COMMIT/ROLLBACK, so a pooled connection never leaks claims.
 *  - service* — runs as the pool's owner role (bypasses RLS) for cross-user
 *               system operations (job recovery, NOTIFY relay).
 */
import pg from "pg";
import { loadConfig } from "./config.js";

export interface JwtClaims {
  sub?: string;
  aud?: string;
  client_id?: string;
  scope?: string;
}

const RLS_CLAIM_KEYS = ["sub", "aud", "client_id", "scope"] as const;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const { DATABASE_URL } = loadConfig();
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      min: 1,
      max: 5,
      statement_timeout: 15_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * LISTEN on a Postgres channel via a dedicated connection (not the pool).
 * `channel` must be a trusted code literal — it is interpolated into the SQL.
 * Returns a stop function.
 */
export async function listen(channel: string, onPayload: (payload: string) => void): Promise<() => Promise<void>> {
  const { DATABASE_URL, DATABASE_LISTEN_URL } = loadConfig();
  // LISTEN needs a session-mode connection; the transaction pooler drops it.
  const client = new pg.Client({ connectionString: DATABASE_LISTEN_URL ?? DATABASE_URL });
  await client.connect();
  client.on("notification", (msg) => {
    if (msg.payload) onPayload(msg.payload);
  });
  await client.query(`LISTEN ${channel}`);
  return async () => {
    await client.end();
  };
}

async function setRls(
  client: pg.PoolClient,
  userId: string,
  claims?: JwtClaims,
): Promise<void> {
  const jwt: Record<string, unknown> = {};
  if (claims) {
    for (const k of RLS_CLAIM_KEYS) {
      const v = claims[k];
      if (v != null) jwt[k] = v;
    }
  }
  if (jwt.sub == null) jwt.sub = userId;
  // Pin the role rather than trusting the token — these connections are always
  // user-scoped and auth.role() drives RLS policy evaluation.
  jwt.role = "authenticated";
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(jwt)]);
}

export async function scopedQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  userId: string,
  sql: string,
  params: unknown[] = [],
  claims?: JwtClaims,
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await setRls(client, userId, claims);
    const res = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return res.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function scopedQueryRow<T extends pg.QueryResultRow = pg.QueryResultRow>(
  userId: string,
  sql: string,
  params: unknown[] = [],
  claims?: JwtClaims,
): Promise<T | null> {
  const rows = await scopedQuery<T>(userId, sql, params, claims);
  return rows[0] ?? null;
}

/** Returns the number of affected rows. */
export async function scopedExecute(
  userId: string,
  sql: string,
  params: unknown[] = [],
  claims?: JwtClaims,
): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await setRls(client, userId, claims);
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function serviceQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

export async function serviceQueryRow<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await serviceQuery<T>(sql, params);
  return rows[0] ?? null;
}

/** Returns the number of affected rows. */
export async function serviceExecute(sql: string, params: unknown[] = []): Promise<number> {
  const res = await getPool().query(sql, params);
  return res.rowCount ?? 0;
}
