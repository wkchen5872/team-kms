"use client";

import * as React from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { DirectoryMapping, UploadPreflight } from "../../lib/upload-batch";

interface UploadPreflightContentProps {
  directory: boolean;
  mapping: DirectoryMapping;
  preflight: UploadPreflight;
  onMappingChange: (mapping: DirectoryMapping) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UploadPreflightContent({
  directory,
  mapping,
  preflight,
  onMappingChange,
  onCancel,
  onConfirm,
}: UploadPreflightContentProps) {
  const excluded = preflight.items.filter((item) => item.reason !== null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>確認批次上傳</DialogTitle>
        <DialogDescription>檢查目錄結構、支援格式與檔名衝突後再開始傳輸。</DialogDescription>
      </DialogHeader>

      {directory && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-2">目錄結構</legend>
          <label className="flex gap-3 rounded-lg border border-border p-3 cursor-pointer">
            <input
              data-action="preserve"
              type="radio"
              name="directory-mapping"
              checked={mapping === "preserve"}
              onChange={() => onMappingChange("preserve")}
            />
            <span>
              <span className="block text-sm font-medium">保留原始目錄結構（建議）</span>
              <span className="block text-xs text-muted-foreground">以選取的資料夾為匯入根目錄，保留其內部路徑。</span>
            </span>
          </label>
          <label className="flex gap-3 rounded-lg border border-border p-3 cursor-pointer">
            <input
              data-action="flatten"
              type="radio"
              name="directory-mapping"
              checked={mapping === "flatten"}
              onChange={() => onMappingChange("flatten")}
            />
            <span>
              <span className="block text-sm font-medium">不保留目錄結構</span>
              <span className="block text-xs text-muted-foreground">所有檔案上傳到目前資料夾，同名檔案會被排除。</span>
            </span>
          </label>
        </fieldset>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["發現", preflight.summary.total],
          ["可上傳", preflight.summary.eligible],
          ["不支援", preflight.summary.unsupported],
          ["衝突", preflight.summary.conflicts],
        ].map(([label, count]) => (
          <div key={label} className="rounded-lg bg-muted px-2 py-3">
            <div className="text-lg font-semibold">{count}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {excluded.length > 0 && (
        <div className="max-h-36 overflow-y-auto rounded-lg border border-border p-3">
          <p className="text-xs font-medium mb-2">不會上傳</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {excluded.map((item) => (
              <li key={`${item.relativePath}-${item.reason}`} className="flex justify-between gap-3">
                <span className="truncate">{item.relativePath}</span>
                <span className="shrink-0">{item.reason === "unsupported" ? "格式不支援" : "目的地衝突"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogFooter>
        <Button data-action="cancel" type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button data-action="confirm" type="button" disabled={preflight.summary.eligible === 0} onClick={onConfirm}>
          開始上傳 {preflight.summary.eligible} 個檔案
        </Button>
      </DialogFooter>
    </>
  );
}

export function UploadPreflightDialog(props: UploadPreflightContentProps & { open: boolean }) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onCancel(); }}>
      <DialogContent className="max-w-lg">
        <UploadPreflightContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
