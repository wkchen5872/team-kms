import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UploadBatchCard } from "./UploadBatchPanel";
import type { UploadBatch, UploadItem } from "../../stores/useUploadStore";

const batch: UploadBatch = {
  id: "batch",
  kbId: "kb",
  totalFiles: 3,
  eligibleFiles: 2,
  totalBytes: 200,
  exclusions: [{ filename: "bad.exe", relativePath: "bad.exe", reason: "unsupported" }],
};

function item(id: string, phase: UploadItem["phase"], error: string | null = null): UploadItem {
  return {
    id,
    batchId: "batch",
    filename: `${id}.pdf`,
    kbId: "kb",
    kbSlug: "slug",
    path: "/",
    size: 100,
    progress: phase === "uploading" ? 0.5 : 1,
    phase,
    documentNumber: null,
    error,
  };
}

describe("UploadBatchCard", () => {
  it("renders a successful result", () => {
    const html = renderToStaticMarkup(
      <UploadBatchCard batch={{ ...batch, totalFiles: 2, exclusions: [] }} items={[item("a", "ready"), item("b", "ready")]} onDismiss={vi.fn()} />,
    );
    expect(html).toContain("已完成 2/2");
  });

  it("renders partial failures and skipped files", () => {
    const html = renderToStaticMarkup(
      <UploadBatchCard batch={batch} items={[item("a", "ready"), item("b", "failed", "network error")]} onDismiss={vi.fn()} />,
    );
    expect(html).toContain("已完成 1/2");
    expect(html).toContain("1 失敗");
    expect(html).toContain("bad.exe");
    expect(html).toContain("network error");
  });

  it("renders an all-excluded result", () => {
    const html = renderToStaticMarkup(
      <UploadBatchCard batch={{ ...batch, totalFiles: 1, eligibleFiles: 0, totalBytes: 0 }} items={[]} onDismiss={vi.fn()} />,
    );
    expect(html).toContain("沒有可上傳的檔案");
  });
});
