"use client";

import * as React from "react";
import { X } from "lucide-react";
import {
  summarizeUploadBatch,
  useUploadStore,
  type UploadBatch,
  type UploadItem,
} from "../../stores/useUploadStore";

interface UploadBatchCardProps {
  batch: UploadBatch;
  items: UploadItem[];
  onDismiss: () => void;
}

export function UploadBatchCard({ batch, items, onDismiss }: UploadBatchCardProps) {
  const summary = summarizeUploadBatch(batch, items);
  const complete = batch.eligibleFiles === 0 || summary.ready + summary.failed >= batch.eligibleFiles;
  const failed = items.filter((item) => item.batchId === batch.id && item.phase === "failed");
  const status = batch.eligibleFiles === 0
    ? "沒有可上傳的檔案"
    : complete
      ? `已完成 ${summary.ready}/${batch.eligibleFiles}${summary.failed ? ` · ${summary.failed} 失敗` : ""}`
      : `已完成 ${summary.ready}/${batch.eligibleFiles} · ${summary.processing} 處理中 · ${summary.queued + summary.uploading} 等待或上傳中`;

  return (
    <section className="w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">批次上傳</h3>
          <p className="text-xs text-muted-foreground mt-1">{status}</p>
        </div>
        {complete && (
          <button type="button" onClick={onDismiss} aria-label="關閉批次結果" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(summary.progress * 100)}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(summary.progress * 100)}%` }} />
      </div>

      {(batch.exclusions.length > 0 || failed.length > 0) && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {batch.exclusions.length} 排除，{failed.length} 失敗
          </summary>
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-muted-foreground">
            {batch.exclusions.map((item) => (
              <li key={`${item.relativePath}-${item.reason}`}>
                {item.relativePath} — {item.reason === "unsupported" ? "格式不支援" : "目的地衝突"}
              </li>
            ))}
            {failed.map((item) => <li key={item.id}>{item.filename} — {item.error ?? "上傳失敗"}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function UploadBatchPanel({ kbId }: { kbId: string }) {
  const batches = useUploadStore((state) => state.batches);
  const items = useUploadStore((state) => state.items);
  const dismissBatch = useUploadStore((state) => state.dismissBatch);
  const visible = batches.filter((batch) => batch.kbId === kbId);
  if (visible.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      {visible.map((batch) => (
        <UploadBatchCard key={batch.id} batch={batch} items={items} onDismiss={() => dismissBatch(batch.id)} />
      ))}
    </div>
  );
}
