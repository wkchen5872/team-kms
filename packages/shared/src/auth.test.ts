import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { verifyToken, extractBearer } from "./auth.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // ambient env
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const email = `authtest-${Date.now()}@test.local`;
const password = "password123!";
let userId = "";
let token = "";

async function createUser(): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  return ((await r.json()) as { id: string }).id;
}

async function passwordGrant(): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return ((await r.json()) as { access_token: string }).access_token;
}

describe.skipIf(!SUPABASE_URL || !SERVICE)("Supabase JWT verification", () => {
  beforeAll(async () => {
    userId = await createUser();
    token = await passwordGrant();
  });

  afterAll(async () => {
    if (userId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  });

  it("verifies a real ES256 user token and returns sub", async () => {
    const { userId: sub, claims } = await verifyToken(token);
    expect(sub).toBe(userId);
    expect(claims.aud).toBe("authenticated");
  });

  it("rejects a malformed token", async () => {
    await expect(verifyToken("not.a.jwt")).rejects.toThrow();
  });

  it("rejects a tampered signature", async () => {
    const parts = token.split(".");
    // Flip the FIRST signature char — its bits are always significant, unlike
    // the trailing base64url char which carries dropped padding bits.
    const first = parts[2]![0] === "A" ? "B" : "A";
    const tampered = `${parts[0]}.${parts[1]}.${first}${parts[2]!.slice(1)}`;
    await expect(verifyToken(tampered)).rejects.toThrow();
  });
});

describe("extractBearer", () => {
  it("pulls the token out of a Bearer header", () => {
    expect(extractBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns null for missing or non-Bearer headers", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("Basic xyz")).toBeNull();
    expect(extractBearer("Bearer ")).toBeNull();
  });
});
