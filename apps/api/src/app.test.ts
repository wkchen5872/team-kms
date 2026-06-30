import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serviceExecute, closePool } from "@team-kms/shared";
import { app } from "./index.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = `apitest-${Date.now()}@test.local`;
let userId = "";
let token = "";
const authHeader = () => ({ authorization: `Bearer ${token}` });

describe.skipIf(!SUPABASE_URL || !SERVICE)("REST API", () => {
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
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
    });
    await closePool();
  });

  it("health is open; /v1 requires auth", async () => {
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/v1/knowledge-bases")).status).toBe(401);
  });

  it("creates, lists, and reads a knowledge base + documents", async () => {
    const created = await app.request("/v1/knowledge-bases", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader() },
      body: JSON.stringify({ name: "API KB" }),
    });
    expect(created.status).toBe(201);
    const kb = (await created.json()) as { slug: string };

    const list = await (await app.request("/v1/knowledge-bases", { headers: authHeader() })).json();
    expect((list as { slug: string }[]).some((k) => k.slug === kb.slug)).toBe(true);

    const docs = (await (await app.request(`/v1/knowledge-bases/${kb.slug}/documents`, { headers: authHeader() })).json()) as {
      filename: string;
    }[];
    expect(docs.map((d) => d.filename).sort()).toEqual(["log.md", "overview.md"]);

    const graph = (await (await app.request(`/v1/knowledge-bases/${kb.slug}/graph`, { headers: authHeader() })).json()) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("issues an API key that authenticates, lists, and revokes", async () => {
    const created = await app.request("/v1/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader() },
      body: JSON.stringify({ name: "ci" }),
    });
    expect(created.status).toBe(201);
    const { key, id } = (await created.json()) as { key: string; id: string };
    expect(key.startsWith("tkms_")).toBe(true);

    // The API key authenticates as the same user.
    const viaKey = await app.request("/v1/knowledge-bases", { headers: { authorization: `Bearer ${key}` } });
    expect(viaKey.status).toBe(200);

    const list = (await (await app.request("/v1/api-keys", { headers: authHeader() })).json()) as { id: string }[];
    expect(list.some((k) => k.id === id)).toBe(true);

    await app.request(`/v1/api-keys/${id}`, { method: "DELETE", headers: authHeader() });
    const afterRevoke = await app.request("/v1/knowledge-bases", { headers: { authorization: `Bearer ${key}` } });
    expect(afterRevoke.status).toBe(401);
  });

  it("uploads a markdown file and reads its content", async () => {
    const kb = (await (
      await app.request("/v1/knowledge-bases", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader() },
        body: JSON.stringify({ name: "Upload KB" }),
      })
    ).json()) as { slug: string };

    const form = new FormData();
    form.append("file", new File(["The grindelwald metric trends upward. ".repeat(6)], "note.md", { type: "text/markdown" }));
    const up = await app.request(`/v1/knowledge-bases/${kb.slug}/upload`, { method: "POST", headers: authHeader(), body: form });
    expect(up.status).toBe(201);
    const doc = (await up.json()) as { id: string };

    const content = (await (await app.request(`/v1/documents/${doc.id}/content`, { headers: authHeader() })).json()) as {
      content: string;
    };
    expect(content.content).toContain("grindelwald");
  });
});
