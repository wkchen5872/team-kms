import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serviceExecute, closePool } from "@team-kms/shared";
import { app } from "./index.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = `tustest-${Date.now()}@test.local`;
let userId = "";
let token = "";
let slug = "";
const auth = () => ({ authorization: `Bearer ${token}` });
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe.skipIf(!SUPABASE_URL || !SERVICE)("TUS resumable upload", () => {
  beforeAll(async () => {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123!", email_confirm: true }),
    });
    userId = ((await u.json()) as { id: string }).id;
    token = ((await (
      await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, "content-type": "application/json" },
        body: JSON.stringify({ email, password: "password123!" }),
      })
    ).json()) as { access_token: string }).access_token;
    slug = ((await (
      await app.request("/v1/knowledge-bases", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth() },
        body: JSON.stringify({ name: "TUS KB" }),
      })
    ).json()) as { slug: string }).slug;
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

  it("resumes a two-chunk upload and ingests on completion", async () => {
    const bytes = Buffer.from("The plumbus calibration drifts over time. ".repeat(8));
    const half = Math.floor(bytes.length / 2);

    const create = await app.request("/v1/files", {
      method: "POST",
      headers: { ...auth(), "upload-length": String(bytes.length), "upload-metadata": `filename ${b64("notes.md")},kb ${b64(slug)}` },
    });
    expect(create.status).toBe(201);
    const loc = create.headers.get("location")!;

    const p1 = await app.request(loc, { method: "PATCH", headers: { ...auth(), "upload-offset": "0" }, body: bytes.subarray(0, half) });
    expect(p1.status).toBe(204);
    expect(p1.headers.get("upload-offset")).toBe(String(half));

    const head = await app.request(loc, { method: "HEAD", headers: auth() });
    expect(head.headers.get("upload-offset")).toBe(String(half));

    const p2 = await app.request(loc, { method: "PATCH", headers: { ...auth(), "upload-offset": String(half) }, body: bytes.subarray(half) });
    expect(p2.status).toBe(204);
    const docId = p2.headers.get("x-document-id");
    expect(docId).toBeTruthy();

    const content = (await (await app.request(`/v1/documents/${docId}/content`, { headers: auth() })).json()) as { content: string };
    expect(content.content).toContain("plumbus");
  });

  it("rejects an oversized upload at creation", async () => {
    const create = await app.request("/v1/files", {
      method: "POST",
      headers: { ...auth(), "upload-length": String(201 * 1024 * 1024), "upload-metadata": `filename ${b64("big.pdf")},kb ${b64(slug)}` },
    });
    expect(create.status).toBe(413);
  });

  it("rejects a file whose signature doesn't match its type", async () => {
    const bytes = Buffer.from("not a pdf!!");
    const create = await app.request("/v1/files", {
      method: "POST",
      headers: { ...auth(), "upload-length": String(bytes.length), "upload-metadata": `filename ${b64("bad.pdf")},kb ${b64(slug)}` },
    });
    const loc = create.headers.get("location")!;
    const patch = await app.request(loc, { method: "PATCH", headers: { ...auth(), "upload-offset": "0" }, body: bytes });
    expect(patch.status).toBe(415);
  });
});
