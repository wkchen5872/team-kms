import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const base = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
};

describe("loadConfig", () => {
  it("parses a minimal valid env with port defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(cfg.API_PORT).toBe(8000);
    expect(cfg.AWS_REGION).toBe("us-east-1");
  });

  it("throws when a required field is missing", () => {
    expect(() => loadConfig({ SUPABASE_URL: base.SUPABASE_URL })).toThrow();
  });

  it("coerces numeric ports from strings", () => {
    const cfg = loadConfig({ ...base, API_PORT: "9000" });
    expect(cfg.API_PORT).toBe(9000);
  });
});
