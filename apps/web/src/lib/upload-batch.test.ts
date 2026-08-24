import { describe, expect, it } from "vitest";
import { buildUploadPreflight, runWithConcurrency, type UploadCandidate } from "./upload-batch";

function candidate(name: string, relativePath = name): UploadCandidate {
  return { file: new File([name], name), relativePath };
}

describe("upload batch preflight", () => {
  it("maps directory files relative to the selected import root", () => {
    const files = [candidate("model.xlsx", "export/Financial/2026/model.xlsx")];

    const preserved = buildUploadPreflight(files, [], "/Sources/", "preserve", true);
    expect(preserved.items[0].destinationPath).toBe("/Sources/Financial/2026/");

    const flattened = buildUploadPreflight(files, [], "/Sources/", "flatten", true);
    expect(flattened.items[0].destinationPath).toBe("/Sources/");
  });

  it("keeps ordinary multi-file uploads in the current folder", () => {
    const result = buildUploadPreflight([candidate("report.pdf")], [], "/Current/", "preserve", false);
    expect(result.items[0].destinationPath).toBe("/Current/");
  });

  it("classifies unsupported, existing, and flattened internal conflicts case-insensitively", () => {
    const files = [
      candidate("report.pdf", "export/A/report.pdf"),
      candidate("REPORT.PDF", "export/B/REPORT.PDF"),
      candidate("existing.csv", "export/C/existing.csv"),
      candidate("script.exe", "export/C/script.exe"),
    ];
    const existing = [{ filename: "Existing.csv", path: "/Imports/", archived: false }];

    const result = buildUploadPreflight(files, existing, "/Imports/", "flatten", true);
    expect(result.summary).toEqual({ total: 4, eligible: 0, unsupported: 1, conflicts: 3 });
    expect(result.items.filter((item) => item.reason === "conflict")).toHaveLength(3);
    expect(result.items.find((item) => item.filename === "script.exe")?.reason).toBe("unsupported");
  });

  it("preserves identical bytes when destination names differ", () => {
    const result = buildUploadPreflight(
      [candidate("a.csv", "export/A/a.csv"), candidate("b.csv", "export/B/b.csv")],
      [],
      "/",
      "preserve",
      true,
    );
    expect(result.summary.eligible).toBe(2);
  });
});

describe("bounded upload worker", () => {
  it("runs at most three jobs concurrently", async () => {
    let active = 0;
    let peak = 0;
    const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return value * 2;
    });

    expect(peak).toBe(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});
