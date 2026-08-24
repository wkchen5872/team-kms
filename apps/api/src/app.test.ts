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

  it("supports KB rename/delete, note create/move/delete, and search", async () => {
    const jsonAuth = { "content-type": "application/json", ...authHeader() };
    const kb = (await (
      await app.request("/v1/knowledge-bases", { method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "CRUD KB" }) })
    ).json()) as { slug: string };

    // rename KB (slug is unchanged)
    const ren = await app.request(`/v1/knowledge-bases/${kb.slug}`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ name: "CRUD KB Renamed" }),
    });
    expect(ren.status).toBe(200);
    expect(((await ren.json()) as { name: string }).name).toBe("CRUD KB Renamed");

    // set project_prompt → echoed back and surfaced in the KB list
    const setPrompt = await app.request(`/v1/knowledge-bases/${kb.slug}`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ project_prompt: "Prefer charts for financial data." }),
    });
    expect(setPrompt.status).toBe(200);
    expect(((await setPrompt.json()) as { project_prompt: string }).project_prompt).toBe("Prefer charts for financial data.");
    const listed = (await (await app.request("/v1/knowledge-bases", { headers: authHeader() })).json()) as { slug: string; project_prompt: string | null }[];
    expect(listed.find((k) => k.slug === kb.slug)?.project_prompt).toBe("Prefer charts for financial data.");

    // over-long project_prompt → 400
    const tooLong = await app.request(`/v1/knowledge-bases/${kb.slug}`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ project_prompt: "x".repeat(4001) }),
    });
    expect(tooLong.status).toBe(400);

    // blank project_prompt clears it (stored as null)
    const clearPrompt = await app.request(`/v1/knowledge-bases/${kb.slug}`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ project_prompt: "  " }),
    });
    expect(clearPrompt.status).toBe(200);
    expect(((await clearPrompt.json()) as { project_prompt: string | null }).project_prompt).toBeNull();

    // create a note with searchable content (returns a full document row)
    const noteRes = await app.request(`/v1/knowledge-bases/${kb.slug}/documents/note`, {
      method: "POST",
      headers: jsonAuth,
      body: JSON.stringify({ filename: "vorlon-notes.md", path: "/", content: "The vorlon consensus stabilized across sectors. ".repeat(6) }),
    });
    expect(noteRes.status).toBe(201);
    const note = (await noteRes.json()) as { id: string; status: string };
    expect(note.status).toBe("ready"); // full listDocuments-shaped row

    // move it into a folder
    const mv = await app.request(`/v1/documents/${note.id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify({ path: "/folder/" }) });
    expect(mv.status).toBe(200);
    expect(((await mv.json()) as { path: string }).path).toBe("/folder/");

    // edit note content via PATCH { content }
    const edit = await app.request(`/v1/documents/${note.id}`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ content: "The vorlon consensus later shifted. ".repeat(6) }),
    });
    expect(edit.status).toBe(200);
    const edited = (await (await app.request(`/v1/documents/${note.id}/content`, { headers: authHeader() })).json()) as { content: string };
    expect(edited.content).toContain("later shifted");

    // search finds it
    const search = (await (
      await app.request(`/v1/knowledge-bases/${kb.slug}/search?q=vorlon`, { headers: authHeader() })
    ).json()) as { results: { filename: string }[] };
    expect(search.results.some((r) => r.filename === "vorlon-notes.md")).toBe(true);

    // delete note, then delete KB
    expect((await app.request(`/v1/documents/${note.id}`, { method: "DELETE", headers: authHeader() })).status).toBe(204);
    expect((await app.request(`/v1/knowledge-bases/${kb.slug}`, { method: "DELETE", headers: authHeader() })).status).toBe(204);
    expect((await app.request(`/v1/knowledge-bases/${kb.slug}/documents`, { headers: authHeader() })).status).toBe(404);
  });

  it("rebuilds references for a KB and 404s on unknown slug", async () => {
    const jsonAuth = { "content-type": "application/json", ...authHeader() };
    const kb = (await (
      await app.request("/v1/knowledge-bases", { method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "Refs KB" }) })
    ).json()) as { slug: string };

    // A source note and a wiki page whose footnote cites it (with a " - " name
    // that the old parser would have truncated).
    const mkNote = (filename: string, path: string, content: string) =>
      app.request(`/v1/knowledge-bases/${kb.slug}/documents/note`, {
        method: "POST",
        headers: jsonAuth,
        body: JSON.stringify({ filename, path, content }),
      });
    await mkNote("2025 - 台糖 - 陳平段.md", "/", "來源內容");
    await mkNote("page.md", "/wiki/", "見報告[^1]\n\n[^1]: 2025 - 台糖 - 陳平段.md");

    const res = await app.request(`/v1/knowledge-bases/${kb.slug}/rebuild-references`, { method: "POST", headers: authHeader() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: number; edges: number };
    expect(body.pages).toBeGreaterThanOrEqual(1);
    expect(body.edges).toBeGreaterThanOrEqual(1);

    const missing = await app.request(`/v1/knowledge-bases/no-such-kb-xyz/rebuild-references`, { method: "POST", headers: authHeader() });
    expect(missing.status).toBe(404);

    await app.request(`/v1/knowledge-bases/${kb.slug}`, { method: "DELETE", headers: authHeader() });
  });

  it("supports folder rename/delete and rejects re-extract of a note", async () => {
    const jsonAuth = { "content-type": "application/json", ...authHeader() };
    const kb = (await (
      await app.request("/v1/knowledge-bases", { method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "Folder KB" }) })
    ).json()) as { slug: string };

    // Two notes in two sibling folders.
    const mk = (filename: string, path: string) =>
      app.request(`/v1/knowledge-bases/${kb.slug}/documents/note`, {
        method: "POST",
        headers: jsonAuth,
        body: JSON.stringify({ filename, path, content: "folder body ".repeat(6) }),
      });
    const noteA = (await (await mk("a.md", "/proj/alpha/")).json()) as { id: string };
    await mk("b.md", "/proj/beta/");

    // Rename /proj/alpha/ → /proj/gamma/ (only alpha moves).
    const ren = await app.request(`/v1/knowledge-bases/${kb.slug}/folders`, {
      method: "PATCH",
      headers: jsonAuth,
      body: JSON.stringify({ path: "/proj/alpha/", name: "gamma" }),
    });
    expect(ren.status).toBe(200);
    expect(((await ren.json()) as { updated: number }).updated).toBe(1);
    const docs = (await (await app.request(`/v1/knowledge-bases/${kb.slug}/documents`, { headers: authHeader() })).json()) as {
      filename: string;
      path: string;
    }[];
    expect(docs.find((d) => d.filename === "a.md")!.path).toBe("/proj/gamma/");
    expect(docs.find((d) => d.filename === "b.md")!.path).toBe("/proj/beta/");

    // re-extract a note (md) is rejected.
    const rx = await app.request(`/v1/documents/${noteA.id}/re-extract`, { method: "POST", headers: authHeader() });
    expect(rx.status).toBe(400);

    // Delete the /proj/gamma/ folder → its note is archived, beta remains.
    const del = await app.request(`/v1/knowledge-bases/${kb.slug}/folders`, {
      method: "DELETE",
      headers: jsonAuth,
      body: JSON.stringify({ path: "/proj/gamma/" }),
    });
    expect(((await del.json()) as { archived: number }).archived).toBe(1);
    const after = (await (await app.request(`/v1/knowledge-bases/${kb.slug}/documents`, { headers: authHeader() })).json()) as {
      filename: string;
    }[];
    expect(after.some((d) => d.filename === "a.md")).toBe(false);
    expect(after.some((d) => d.filename === "b.md")).toBe(true);
  });

  it("uploads CSV into the requested folder and reads its content", async () => {
    const kb = (await (
      await app.request("/v1/knowledge-bases", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader() },
        body: JSON.stringify({ name: "Upload KB" }),
      })
    ).json()) as { slug: string };

    const form = new FormData();
    form.append("file", new File(["month,revenue\n2026-01,12345\n"], "financial-summary.csv", { type: "text/csv" }));
    form.append("path", "/1.2 Binding Proposal Stage Transaction Documents/");
    const up = await app.request(`/v1/knowledge-bases/${kb.slug}/upload`, { method: "POST", headers: authHeader(), body: form });
    expect(up.status).toBe(201);
    const doc = (await up.json()) as { id: string; path: string };
    expect(doc.path).toBe("/1.2 Binding Proposal Stage Transaction Documents/");

    const content = (await (await app.request(`/v1/documents/${doc.id}/content`, { headers: authHeader() })).json()) as {
      content: string;
    };
    expect(content.content).toContain("revenue");

    const duplicateForm = new FormData();
    duplicateForm.append("file", new File(["month,revenue\n2026-01,12345\n"], "financial-summary-copy.csv", { type: "text/csv" }));
    duplicateForm.append("path", "/Project Indexes/");
    duplicateForm.append("deduplicate", "false");
    const duplicate = await app.request(`/v1/knowledge-bases/${kb.slug}/upload`, {
      method: "POST",
      headers: authHeader(),
      body: duplicateForm,
    });
    expect(duplicate.status).toBe(201);
    const duplicateDoc = (await duplicate.json()) as { id: string; path: string };
    expect(duplicateDoc.id).not.toBe(doc.id);
    expect(duplicateDoc.path).toBe("/Project Indexes/");
  });
});
