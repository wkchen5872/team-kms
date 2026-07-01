import { describe, it, expect } from "vitest";
import { extractDateAndMeta, effectiveDate, parseFrontmatter } from "./wiki.js";

describe("wiki frontmatter date normalization", () => {
  it("normalizes an unquoted YAML date (parsed as a Date object) to YYYY-MM-DD", () => {
    const [date] = extractDateAndMeta(parseFrontmatter("---\ndate: 2026-06-30\n---\n"));
    expect(date).toBe("2026-06-30");
  });

  it("leaves a quoted date string untouched", () => {
    const [date] = extractDateAndMeta(parseFrontmatter(`---\ndate: "2026-06-30"\n---\n`));
    expect(date).toBe("2026-06-30");
  });

  it("normalizes a full timestamp to the date part", () => {
    const [date] = extractDateAndMeta(parseFrontmatter("---\ndate: 2026-06-30 08:00:00\n---\n"));
    expect(date).toBe("2026-06-30");
  });

  it("effectiveDate returns the normalized frontmatter date", () => {
    expect(effectiveDate("---\ntitle: X\ndate: 2026-06-30\n---\n\nbody")).toBe("2026-06-30");
  });
});
