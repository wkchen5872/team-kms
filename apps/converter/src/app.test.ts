import { describe, it, expect } from "vitest";
import { app } from "./index.js";

const auth = { authorization: "Bearer test-secret" };

describe("converter app", () => {
  it("health check", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("rejects /extract without the bearer secret", async () => {
    const res = await app.request("/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_url: "http://x", source_ext: "pdf" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported extension", async () => {
    const res = await app.request("/extract", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ source_url: "http://127.0.0.1:54321/storage/v1/s3/team-kms-assets/x", source_ext: "exe" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an SSRF source url", async () => {
    const res = await app.request("/extract", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ source_url: "http://169.254.169.254/x", source_ext: "pdf" }),
    });
    expect(res.status).toBe(400);
  });
});
