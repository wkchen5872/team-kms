/**
 * REST API (Hono) — Supabase-JWT authenticated, RLS-scoped per user.
 * Serves the web app: knowledge bases, documents, graph, and upload (ingest).
 */
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import {
  PostgresVaultFS,
  s3FromConfig,
  verifyToken,
  extractBearer,
  scopedQueryRow,
  serviceQuery,
  serviceQueryRow,
  serviceExecute,
} from "@team-kms/shared";
import { HttpConverterClient } from "./converter-client.js";
import { ingestSource } from "./ingest.js";
import { startDocumentListener, subscribe } from "./notify.js";
import { setProcessor, recoverStuckJobs, extractionProcessor } from "./jobs.js";
import {
  TUS_VERSION,
  decodeMetadata,
  createUpload,
  getUpload,
  appendChunk,
  deleteUpload,
  validateSignature,
  OffsetMismatch,
} from "./tus.js";

type Vars = { userId: string; fs: PostgresVaultFS };
export const app = new Hono<{ Variables: Vars }>();

// CORS for the web app. Registered first so OPTIONS preflight is answered
// before the auth middleware. exposeHeaders lets the browser read the TUS
// upload headers (Location / Upload-Offset / X-Document-Id).
app.use(
  "*",
  cors({
    origin: [process.env.APP_URL ?? "http://localhost:3000", "http://localhost:3000", "http://127.0.0.1:3000"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "Upload-Length", "Upload-Offset", "Upload-Metadata", "Tus-Resumable"],
    exposeHeaders: ["Location", "Upload-Offset", "Upload-Length", "Tus-Resumable", "X-Document-Id"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");

async function resolveUser(token: string): Promise<string | null> {
  // Programmatic access via API key (tkms_…), else a Supabase JWT.
  if (token.startsWith("tkms_")) {
    const row = await serviceQueryRow<{ user_id: string }>(
      "SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
      [hashApiKey(token)],
    );
    if (row) void serviceExecute("UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1", [hashApiKey(token)]);
    return row?.user_id ?? null;
  }
  try {
    return (await verifyToken(token)).userId;
  } catch {
    return null;
  }
}

// ── auth middleware (everything under /v1) ───────────────────────
app.use("/v1/*", async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) return c.json({ error: "Missing authorization header" }, 401);
  const userId = await resolveUser(token);
  if (!userId) return c.json({ error: "Invalid token" }, 401);
  c.set("userId", userId);
  c.set("fs", new PostgresVaultFS(userId));
  return next();
});

app.post("/v1/api-keys", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const plaintext = `tkms_${randomBytes(24).toString("hex")}`;
  const row = await serviceQueryRow(
    "INSERT INTO api_keys (user_id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4) " +
      "RETURNING id, name, key_prefix, created_at",
    [c.get("userId"), body.name ?? null, hashApiKey(plaintext), plaintext.slice(0, 12)],
  );
  return c.json({ ...row, key: plaintext }, 201);
});

app.get("/v1/api-keys", async (c) =>
  c.json(
    await serviceQuery(
      "SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys " +
        "WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
      [c.get("userId")],
    ),
  ),
);

app.delete("/v1/api-keys/:id", async (c) => {
  await serviceExecute("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2", [
    c.req.param("id"),
    c.get("userId"),
  ]);
  return c.json({ revoked: true });
});

app.get("/v1/me", async (c) => {
  const userId = c.get("userId");
  const me = await scopedQueryRow(userId, "SELECT id, email, display_name, onboarded FROM users WHERE id = $1", [userId]);
  return c.json(me ?? { id: userId });
});

app.get("/v1/knowledge-bases", async (c) => c.json(await c.get("fs").listKnowledgeBases()));

app.post("/v1/knowledge-bases", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; description?: string; kind?: string };
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
  const kb = await c.get("fs").createKnowledgeBase(body.name.trim(), body.description ?? null, body.kind ?? "wiki");
  return c.json(kb, 201);
});

app.get("/v1/knowledge-bases/:slug/documents", async (c) => {
  const fs = c.get("fs");
  const kb = await fs.resolveKb(c.req.param("slug"));
  if (!kb) return c.json({ error: "Knowledge base not found" }, 404);
  return c.json(await fs.listDocuments(kb.id));
});

app.get("/v1/knowledge-bases/:slug/graph", async (c) => {
  const fs = c.get("fs");
  const kb = await fs.resolveKb(c.req.param("slug"));
  if (!kb) return c.json({ error: "Knowledge base not found" }, 404);
  const [nodes, edges] = await Promise.all([fs.listDocuments(kb.id), fs.listReferences(kb.id)]);
  return c.json({ nodes, edges });
});

app.get("/v1/documents/:id/content", async (c) => {
  const doc = await c.get("fs").getDocumentById(c.req.param("id"));
  if (!doc) return c.json({ error: "Document not found" }, 404);
  return c.json({
    id: doc.id,
    filename: doc.filename,
    title: doc.title,
    file_type: doc.file_type,
    content: doc.content ?? "",
  });
});

app.get("/v1/documents/:id/source-url", async (c) => {
  const fs = c.get("fs");
  const doc = await fs.getDocumentById(c.req.param("id"));
  if (!doc) return c.json({ error: "Document not found" }, 404);
  const key = `${c.get("userId")}/${doc.id}/source.${doc.file_type}`;
  return c.json({ url: await s3FromConfig().generatePresignedGet(key) });
});

app.post("/v1/knowledge-bases/:slug/upload", async (c) => {
  const fs = c.get("fs");
  const kb = await fs.resolveKb(c.req.param("slug"));
  if (!kb) return c.json({ error: "Knowledge base not found" }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required (multipart)" }, 400);
  const fileType = (file.name.split(".").pop() ?? "").toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

  const doc = await ingestSource({ fs, s3: s3FromConfig(), converter: buildConverter() }, {
    kbId: kb.id,
    filename: file.name,
    fileType,
    bytes,
  });
  return c.json(doc, 201);
});

function buildConverter(): HttpConverterClient {
  return new HttpConverterClient(process.env.CONVERTER_URL ?? "http://localhost:8002", process.env.CONVERTER_SECRET ?? "");
}

// ── TUS 1.0 resumable upload ─────────────────────────────────────
app.post("/v1/files", async (c) => {
  const meta = decodeMetadata(c.req.header("upload-metadata") ?? "");
  const filename = meta.filename;
  const kbSlug = meta.kb;
  if (!filename || !kbSlug) return c.json({ error: "Upload-Metadata must include filename and kb" }, 400);
  const kb = await c.get("fs").resolveKb(kbSlug);
  if (!kb) return c.json({ error: "Knowledge base not found" }, 404);
  try {
    const up = createUpload({ length: Number(c.req.header("upload-length")), filename, kbSlug, userId: c.get("userId") });
    c.header("Location", `/v1/files/${up.id}`);
    c.header("Tus-Resumable", TUS_VERSION);
    return c.body(null, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 413);
  }
});

app.on(["HEAD", "GET"], "/v1/files/:id", (c) => {
  const up = getUpload(c.req.param("id"));
  if (!up || up.userId !== c.get("userId")) return c.body(null, 404);
  c.header("Upload-Offset", String(up.offset));
  c.header("Upload-Length", String(up.length));
  c.header("Tus-Resumable", TUS_VERSION);
  c.header("Cache-Control", "no-store");
  return c.body(null, 200);
});

app.patch("/v1/files/:id", async (c) => {
  const id = c.req.param("id");
  const up = getUpload(id);
  if (!up || up.userId !== c.get("userId")) return c.body(null, 404);
  const offset = Number(c.req.header("upload-offset"));
  const chunk = Buffer.from(await c.req.arrayBuffer());
  let newOffset: number;
  try {
    newOffset = appendChunk(id, offset, chunk);
  } catch (err) {
    if (err instanceof OffsetMismatch) return c.json({ error: err.message }, 409);
    return c.json({ error: (err as Error).message }, 400);
  }

  c.header("Tus-Resumable", TUS_VERSION);
  c.header("Upload-Offset", String(newOffset));

  if (newOffset === up.length) {
    if (!validateSignature(up.data, up.fileType)) {
      deleteUpload(id);
      return c.json({ error: "file signature does not match its type" }, 415);
    }
    const fs = c.get("fs");
    const kb = await fs.resolveKb(up.kbSlug);
    if (!kb) return c.json({ error: "Knowledge base not found" }, 404);
    const doc = await ingestSource({ fs, s3: s3FromConfig(), converter: buildConverter() }, {
      kbId: kb.id,
      filename: up.filename,
      fileType: up.fileType,
      bytes: up.data,
    });
    deleteUpload(id);
    c.header("X-Document-Id", doc.id);
  }
  return c.body(null, 204);
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? "8000");
  const server = serve({ fetch: app.fetch, port }) as unknown as import("node:http").Server;
  void startDocumentListener();
  // Async extraction queue + recover anything left mid-flight by a prior crash.
  setProcessor(extractionProcessor(s3FromConfig(), buildConverter()));
  void recoverStuckJobs();

  // Real-time document changes: ws://…/v1/ws/kb/:kbId?token=<supabase-jwt>
  const wss = new WebSocketServer({ server });
  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      const match = /^\/v1\/ws\/kb\/([^/]+)$/.exec(url.pathname);
      const token = url.searchParams.get("token");
      if (!match || !token) return ws.close();
      const { userId } = await verifyToken(token);
      const kbId = match[1];
      const unsub = subscribe(userId, (e) => {
        if (e.knowledge_base_id === kbId) ws.send(JSON.stringify(e));
      });
      ws.on("close", unsub);
    } catch {
      ws.close();
    }
  });
  console.log(`api listening on :${port}`);
}
