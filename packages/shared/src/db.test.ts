import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scopedQuery, serviceExecute, serviceQueryRow, closePool } from "./db.js";

// Load repo-root .env so DATABASE_URL points at the local Supabase stack.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // no .env — rely on ambient environment
}

const u1 = randomUUID();
const u2 = randomUUID();
let kbId: string;

// Integration test: requires the local Postgres (Supabase) to be reachable.
describe.skipIf(!process.env.DATABASE_URL)("RLS isolation", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)", [
      u1,
      `${u1}@test.local`,
      u2,
      `${u2}@test.local`,
    ]);
    const kb = await serviceQueryRow<{ id: string }>(
      "INSERT INTO knowledge_bases (user_id, name) VALUES ($1, $2) RETURNING id",
      [u1, "RLS Test KB"],
    );
    kbId = kb!.id;
  });

  afterAll(async () => {
    // Cascade deletes the KB via the user_id FK.
    await serviceExecute("DELETE FROM users WHERE id = ANY($1)", [[u1, u2]]);
    await closePool();
  });

  it("owner sees their knowledge base", async () => {
    const rows = await scopedQuery(u1, "SELECT id FROM knowledge_bases WHERE id = $1", [kbId]);
    expect(rows).toHaveLength(1);
  });

  it("other user cannot see it (RLS blocks)", async () => {
    const rows = await scopedQuery(u2, "SELECT id FROM knowledge_bases WHERE id = $1", [kbId]);
    expect(rows).toHaveLength(0);
  });

  it("service role bypasses RLS", async () => {
    const row = await serviceQueryRow("SELECT id FROM knowledge_bases WHERE id = $1", [kbId]);
    expect(row).not.toBeNull();
  });
});
