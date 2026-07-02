import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashApiKey, serviceExecute, closePool } from "@team-kms/shared";
import { app } from "./index.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = `mcphttp-${Date.now()}@test.local`;
let userId = "";
let token = "";

const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
};
const mcpHeaders = (auth?: string) => ({
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  ...(auth ? { authorization: auth } : {}),
});

describe.skipIf(!SUPABASE_URL || !SERVICE)("MCP HTTP + JWT", () => {
  beforeAll(async () => {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123!", email_confirm: true }),
    });
    userId = ((await u.json()) as { id: string }).id;
    const t = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123!" }),
    });
    token = ((await t.json()) as { access_token: string }).access_token;
  });

  afterAll(async () => {
    if (userId) {
      await serviceExecute("DELETE FROM api_keys WHERE user_id = $1", [userId]);
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
      });
    }
    await closePool();
  });

  it("health is open", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });

  it("rejects /mcp without a token", async () => {
    const res = await app.request("/mcp", { method: "POST", headers: mcpHeaders(), body: JSON.stringify(initBody) });
    expect(res.status).toBe(401);
  });

  it("rejects /mcp with an invalid token", async () => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: mcpHeaders("Bearer not.a.jwt"),
      body: JSON.stringify(initBody),
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and completes the MCP initialize handshake", async () => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: mcpHeaders(`Bearer ${token}`),
      body: JSON.stringify(initBody),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(json.result?.serverInfo?.name).toBe("Team KMS Wiki");
  });

  it("accepts a tkms_ API key (what Settings generates for MCP)", async () => {
    const key = `tkms_httptest${Date.now().toString(36)}`;
    await serviceExecute(
      "INSERT INTO api_keys (user_id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4)",
      [userId, "http-test", hashApiKey(key), key.slice(0, 12)],
    );
    const res = await app.request("/mcp", {
      method: "POST",
      headers: mcpHeaders(`Bearer ${key}`),
      body: JSON.stringify(initBody),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(json.result?.serverInfo?.name).toBe("Team KMS Wiki");
  });
});
