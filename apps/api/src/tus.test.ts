import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serviceExecute, closePool } from "@team-kms/shared";
import { app } from "./index.js";
import { createUpload, deleteUpload, normalizeUploadPath } from "./tus.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = `tustest-${Date.now()}@test.local`;
let userId = "";
let token = "";
let slug = "";
const auth = () => ({ authorization: `Bearer ${token}` });
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("TUS upload paths", () => {
  it("normalizes nested paths and defaults missing paths to root", () => {
    expect(normalizeUploadPath("/finance/2026")).toBe("/finance/2026/");
    expect(normalizeUploadPath("/finance/2026/")).toBe("/finance/2026/");
    expect(normalizeUploadPath(undefined)).toBe("/");

    const upload = createUpload({ length: 1, filename: "a.md", kbSlug: "kb", userId: "user" });
    expect(upload.dirPath).toBe("/");
    deleteUpload(upload.id);
  });

  it.each(["relative", "/a/../b/", "/a/./b/", "/a//b/", "/a\\b/", "/a\0b/"])(
    "rejects invalid path %j",
    (dirPath) => expect(() => normalizeUploadPath(dirPath)).toThrow("invalid upload path"),
  );
});

describe.skipIf(!SUPABASE_URL || !SERVICE)("TUS resumable upload", () => {
  async function uploadBytes(filename: string, bytes: Buffer, dirPath?: string) {
    const metadata = [`filename ${b64(filename)}`, `kb ${b64(slug)}`];
    if (dirPath) metadata.push(`path ${b64(dirPath)}`);
    const create = await app.request("/v1/files", {
      method: "POST",
      headers: { ...auth(), "upload-length": String(bytes.length), "upload-metadata": metadata.join(",") },
    });
    expect(create.status).toBe(201);
    return app.request(create.headers.get("location")!, {
      method: "PATCH",
      headers: { ...auth(), "upload-offset": "0" },
      body: bytes,
    });
  }

  const uploadText = (filename: string, content: string, dirPath?: string) =>
    uploadBytes(filename, Buffer.from(content), dirPath);

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

  it("keeps nested paths for markdown, text, and CSV source uploads", async () => {
    const dirPath = "/Financial Information/2026/";
    for (const [filename, content] of [
      ["nested.md", "markdown source"],
      ["nested.txt", "text source"],
      ["nested.csv", "month,revenue\n2026-01,12345\n"],
    ] as const) {
      const response = await uploadText(filename, content, dirPath);
      expect(response.status).toBe(204);
      expect(response.headers.get("x-document-status")).toBe("ready");
    }

    const documents = (await (
      await app.request(`/v1/knowledge-bases/${slug}/documents`, { headers: auth() })
    ).json()) as Array<{ filename: string; path: string; kind: string; status: string }>;
    for (const filename of ["nested.md", "nested.txt", "nested.csv"]) {
      expect(documents).toContainEqual(expect.objectContaining({ filename, path: dirPath, kind: "raw", status: "ready" }));
    }
  });

  it("preserves identical bytes at distinct destinations and rejects a destination conflict", async () => {
    const content = "month,revenue\n2026-01,12345\n";
    const first = await uploadText("copy.csv", content, "/Copies/A/");
    const second = await uploadText("copy.csv", content, "/Copies/B/");
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(second.headers.get("x-document-id")).not.toBe(first.headers.get("x-document-id"));

    const conflict = await uploadText("copy.csv", "different bytes", "/Copies/A/");
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "A document already exists at that path" });
  });

  it("imports a mixed preserved directory batch with expected paths and statuses", async () => {
    expect((await uploadText("overview.md", "project overview", "/Mixed/Docs/")).status).toBe(204);
    expect((await uploadText("data.csv", "name,value\nsolar,1\n", "/Mixed/Data/")).status).toBe(204);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const image = await uploadBytes("diagram.png", png, "/Mixed/Images/");
    expect(image.status).toBe(204);
    expect(image.headers.get("x-document-status")).toBe("pending");

    const documents = (await (
      await app.request(`/v1/knowledge-bases/${slug}/documents`, { headers: auth() })
    ).json()) as Array<{ filename: string; path: string; status: string }>;
    expect(documents).toContainEqual(expect.objectContaining({ filename: "overview.md", path: "/Mixed/Docs/", status: "ready" }));
    expect(documents).toContainEqual(expect.objectContaining({ filename: "data.csv", path: "/Mixed/Data/", status: "ready" }));
    expect(documents).toContainEqual(expect.objectContaining({ filename: "diagram.png", path: "/Mixed/Images/", status: "pending" }));
  });
});
