import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresVaultFS, serviceExecute, closePool } from "@team-kms/shared";
import { startDocumentListener, stopDocumentListener, type DocChange } from "./notify.js";

const userId = randomUUID();
let fs: PostgresVaultFS;

describe.skipIf(!process.env.DATABASE_URL)("document change relay", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@test.local`]);
    fs = new PostgresVaultFS(userId);
  });

  afterAll(async () => {
    await stopDocumentListener();
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await closePool();
  });

  it("relays a document INSERT from Postgres NOTIFY to a subscriber", async () => {
    let resolveEvt!: (e: DocChange) => void;
    const evt = new Promise<DocChange>((res) => (resolveEvt = res));
    await startDocumentListener((e) => {
      if (e.user_id === userId) resolveEvt(e);
    });
    // createKnowledgeBase inserts the scaffolded wiki docs → fires the trigger.
    await fs.createKnowledgeBase("WS KB");
    const e = await evt;
    expect(e.event).toBe("INSERT");
    expect(e.knowledge_base_id).toBeTruthy();
  }, 15_000);
});
