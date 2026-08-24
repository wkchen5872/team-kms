import { create } from "zustand";
import type { DocumentListItem } from "@/lib/types";

export type UploadPhase = "queued" | "uploading" | "processing" | "ready" | "failed";

export interface UploadBatchExclusion {
  filename: string;
  relativePath: string;
  reason: "unsupported" | "conflict";
}

export interface UploadBatch {
  id: string;
  kbId: string;
  totalFiles: number;
  eligibleFiles: number;
  totalBytes: number;
  exclusions: UploadBatchExclusion[];
}

export interface UploadItem {
  id: string;
  batchId: string;
  filename: string;
  kbId: string;
  kbSlug: string;
  path: string;
  size: number;
  progress: number;
  phase: UploadPhase;
  documentNumber: number | null;
  error: string | null;
}

interface OpenDocRequest {
  kbId: string;
  documentNumber: number;
  nonce: number;
}

interface NewUpload {
  id: string;
  batchId: string;
  filename: string;
  kbId: string;
  kbSlug: string;
  path: string;
  size: number;
}

interface UploadState {
  items: UploadItem[];
  batches: UploadBatch[];
  openRequest: OpenDocRequest | null;
  addBatch: (batch: UploadBatch) => void;
  addUpload: (upload: NewUpload) => void;
  markUploading: (id: string) => void;
  setProgress: (id: string, progress: number) => void;
  markProcessing: (id: string) => void;
  markFailed: (id: string, error?: string | null) => void;
  reconcileDocuments: (kbId: string, documents: DocumentListItem[]) => void;
  dismiss: (id: string) => void;
  dismissBatch: (id: string) => void;
  clearFinished: () => void;
  requestOpenDocument: (kbId: string, documentNumber: number) => void;
  consumeOpenRequest: () => void;
}

function matchDocument(item: UploadItem, documents: DocumentListItem[]): DocumentListItem | undefined {
  const name = item.filename.toLowerCase();
  return documents.find((d) => !d.archived && d.path === item.path && d.filename.toLowerCase() === name);
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],
  batches: [],
  openRequest: null,

  addBatch: (batch) => set((state) => ({ batches: [batch, ...state.batches] })),

  addUpload: (upload) =>
    set((state) => ({
      items: [{ ...upload, progress: 0, phase: "queued", documentNumber: null, error: null }, ...state.items],
    })),

  markUploading: (id) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, phase: "uploading" } : item)),
    })),

  setProgress: (id, progress) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id && item.phase === "uploading" ? { ...item, progress } : item)),
    })),

  markProcessing: (id) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, phase: "processing", progress: 1 } : item)),
    })),

  markFailed: (id, error = null) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, phase: "failed", error } : item)),
    })),

  reconcileDocuments: (kbId, documents) =>
    set((state) => {
      let changed = false;
      const items = state.items.map((item) => {
        if (item.kbId !== kbId || item.phase !== "processing") return item;
        const doc = matchDocument(item, documents);
        if (!doc) return item;
        const phase: UploadPhase = doc.status === "ready" ? "ready" : doc.status === "failed" ? "failed" : "processing";
        const error = doc.status === "failed" ? (doc.error_message ?? null) : item.error;
        if (phase === item.phase && (doc.document_number ?? null) === item.documentNumber && error === item.error) {
          return item;
        }
        changed = true;
        return { ...item, phase, documentNumber: doc.document_number ?? null, error };
      });
      return changed ? { items } : state;
    }),

  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  dismissBatch: (id) =>
    set((state) => ({
      batches: state.batches.filter((batch) => batch.id !== id),
      items: state.items.filter((item) => item.batchId !== id),
    })),

  clearFinished: () =>
    set((state) => ({
      items: state.items.filter((item) => item.phase === "queued" || item.phase === "uploading" || item.phase === "processing"),
    })),

  requestOpenDocument: (kbId, documentNumber) =>
    set((state) => ({ openRequest: { kbId, documentNumber, nonce: (state.openRequest?.nonce ?? 0) + 1 } })),

  consumeOpenRequest: () => set({ openRequest: null }),
}));

export function summarizeUploadBatch(batch: UploadBatch, items: UploadItem[]) {
  const batchItems = items.filter((item) => item.batchId === batch.id);
  const count = (phase: UploadPhase) => batchItems.filter((item) => item.phase === phase).length;
  const transferredBytes = batchItems.reduce((sum, item) => {
    if (item.phase === "queued") return sum;
    if (item.phase === "uploading") return sum + item.size * item.progress;
    return sum + item.size;
  }, 0);
  return {
    queued: count("queued"),
    uploading: count("uploading"),
    processing: count("processing"),
    ready: count("ready"),
    failed: count("failed"),
    skipped: batch.exclusions.length,
    progress: batch.totalBytes > 0 ? transferredBytes / batch.totalBytes : 1,
  };
}
