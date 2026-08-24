/**
 * Hosted MCP server (Hono + Web-standard streamable HTTP), authenticated with
 * Supabase JWTs. Each request is scoped to the token's user via RLS-backed
 * VaultFS. Ported from llmwiki `mcp/hosted.py`.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { PostgresVaultFS, resolveUserId, extractBearer, resolvePort } from "@team-kms/shared";
import { buildMcpServer } from "./server.js";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.all("/mcp", async (c) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) return c.json({ error: "Missing authorization header" }, 401);
  // Accept both a `tkms_` API key (what Settings generates for MCP) and a Supabase JWT.
  const userId = await resolveUserId(token);
  if (!userId) return c.json({ error: "Invalid token" }, 401);

  const fs = new PostgresVaultFS(userId);
  const server = buildMcpServer(fs);
  // Stateless: a fresh server+transport per request, scoped to this user.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

if (process.env.NODE_ENV !== "test") {
  const port = resolvePort(process.env.PORT, process.env.MCP_PORT, 8011);
  serve({ fetch: app.fetch, port });
  console.log(`mcp listening on :${port}`);
}
