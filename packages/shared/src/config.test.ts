import { describe, it, expect } from "vitest";
import { loadConfig, resolvePort } from "./config.js";

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

  it("accepts an optional DATABASE_LISTEN_URL", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
    expect(loadConfig({ ...base, DATABASE_LISTEN_URL: url }).DATABASE_LISTEN_URL).toBe(url);
    expect(loadConfig(base).DATABASE_LISTEN_URL).toBeUndefined();
  });

  it("treats an empty DATABASE_LISTEN_URL as unset", () => {
    expect(loadConfig({ ...base, DATABASE_LISTEN_URL: "" }).DATABASE_LISTEN_URL).toBeUndefined();
  });
});

describe("resolvePort", () => {
  it("prefers PORT (Cloud Run) over the service var", () => {
    expect(resolvePort("8080", "8000", 8000)).toBe(8080);
  });

  it("falls back to the service var when PORT is unset", () => {
    expect(resolvePort(undefined, "8000", 9999)).toBe(8000);
  });

  it("uses the default when neither is set", () => {
    expect(resolvePort(undefined, undefined, 8001)).toBe(8001);
  });
});
