import { beforeEach, describe, expect, it } from "vitest";
import { summarizeUploadBatch, useUploadStore } from "./useUploadStore";

describe("upload batch store", () => {
  beforeEach(() => useUploadStore.setState({ items: [], batches: [], openRequest: null }));

  it("tracks queued transfer progress and reconciles processing files", () => {
    const store = useUploadStore.getState();
    store.addBatch({
      id: "batch",
      kbId: "kb",
      totalFiles: 3,
      eligibleFiles: 2,
      totalBytes: 300,
      exclusions: [{ filename: "bad.exe", relativePath: "bad.exe", reason: "unsupported" }],
    });
    store.addUpload({ id: "a", batchId: "batch", filename: "a.md", kbId: "kb", kbSlug: "slug", path: "/", size: 100 });
    store.addUpload({ id: "b", batchId: "batch", filename: "b.pdf", kbId: "kb", kbSlug: "slug", path: "/", size: 200 });
    expect(useUploadStore.getState().items.every((item) => item.phase === "queued")).toBe(true);

    store.markUploading("a");
    store.setProgress("a", 0.5);
    let state = useUploadStore.getState();
    expect(summarizeUploadBatch(state.batches[0], state.items).progress).toBeCloseTo(1 / 6);

    store.markProcessing("a");
    useUploadStore.getState().reconcileDocuments("kb", [
      { id: "doc", filename: "a.md", title: "a", path: "/", file_type: "md", kind: "raw", status: "ready", archived: false },
    ]);
    state = useUploadStore.getState();
    expect(state.items.find((item) => item.id === "a")?.phase).toBe("ready");
    expect(summarizeUploadBatch(state.batches[0], state.items)).toEqual(expect.objectContaining({ ready: 1, queued: 1 }));
  });
});
