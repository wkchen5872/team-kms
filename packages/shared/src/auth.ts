/**
 * Supabase JWT verification, ported from llmwiki `mcp/auth.py` + `api/auth.py`.
 *
 * Supabase signs user session tokens with an asymmetric key (ES256) exposed at
 * the project's JWKS endpoint. `jose`'s createRemoteJWKSet handles fetching,
 * caching, and key-rotation/cooldown — replacing the hand-rolled JWKS cache in
 * the Python `api/auth.py`.
 */
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from "jose";
import { loadConfig } from "./config.js";
import { serviceQueryRow, serviceExecute } from "./db.js";

export interface VerifiedUser {
  userId: string;
  claims: JWTPayload;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let expectedIssuer = "";

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const { SUPABASE_URL } = loadConfig();
    const base = SUPABASE_URL.replace(/\/$/, "");
    expectedIssuer = `${base}/auth/v1`;
    jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

/** Verify a Supabase JWT; resolves to the user id (sub) and claims, or throws. */
export async function verifyToken(token: string): Promise<VerifiedUser> {
  const keys = getJwks();
  const { payload } = await jwtVerify(token, keys, {
    issuer: expectedIssuer,
    audience: "authenticated",
    algorithms: ["ES256", "RS256"],
    clockTolerance: 30,
    requiredClaims: ["exp", "iat", "sub", "aud", "iss"],
  });
  if (!payload.sub) throw new Error("Token missing sub claim");
  return { userId: payload.sub, claims: payload };
}

/** Extract a bearer token from an Authorization header value, or null. */
export function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

/** Verify the bearer token from an Authorization header; throws on missing/invalid. */
export async function getCurrentUser(authHeader: string | null | undefined): Promise<VerifiedUser> {
  const token = extractBearer(authHeader);
  if (!token) throw new Error("Missing authorization header");
  return verifyToken(token);
}

/** SHA-256 hash of an API key (matches how api-keys are stored/looked up). */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve a bearer token to a user id, accepting BOTH a `tkms_` API key
 * (hashed lookup in api_keys, service-role) and a Supabase JWT. Returns null
 * if neither resolves. Shared by the REST API and the MCP server so programmatic
 * Claude access via API keys works against MCP too.
 */
export async function resolveUserId(token: string): Promise<string | null> {
  if (token.startsWith("tkms_")) {
    const keyHash = hashApiKey(token);
    const row = await serviceQueryRow<{ user_id: string }>(
      "SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
      [keyHash],
    );
    if (!row) return null;
    void serviceExecute("UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1", [keyHash]);
    return row.user_id;
  }
  try {
    return (await verifyToken(token)).userId;
  } catch {
    return null;
  }
}

/** Decode without verifying — for logging/inspection only, never for auth. */
export function unsafeDecode(token: string): JWTPayload {
  return decodeJwt(token);
}
