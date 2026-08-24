"use client";

import * as React from "react";
import { FileUp, FolderUp } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface UploadPickerContentProps {
  directorySupported: boolean;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
}

export function UploadPickerContent({ directorySupported, onSelectFiles, onSelectFolder }: UploadPickerContentProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>上傳 Sources</DialogTitle>
        <DialogDescription>選擇多個檔案，或匯入資料夾中的所有支援檔案。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button data-action="select-files" type="button" variant="outline" className="h-auto flex-col py-6" onClick={onSelectFiles}>
          <FileUp className="size-6" />
          <span>選擇檔案</span>
          <span className="text-xs font-normal text-muted-foreground">可一次選取多個檔案</span>
        </Button>
        <Button
          data-action="select-folder"
          type="button"
          variant="outline"
          className="h-auto flex-col py-6"
          disabled={!directorySupported}
          onClick={onSelectFolder}
        >
          <FolderUp className="size-6" />
          <span>選擇資料夾</span>
          <span className="text-xs font-normal text-muted-foreground">可保留多層目錄</span>
        </Button>
      </div>
      {!directorySupported && (
        <p data-action="directory-unavailable" className="text-xs text-muted-foreground">
          此瀏覽器無法選擇資料夾；仍可使用多檔案上傳。
        </p>
      )}
    </>
  );
}

export function UploadPickerDialog(props: UploadPickerContentProps & { open: boolean; onCancel: () => void }) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onCancel(); }}>
      <DialogContent className="max-w-lg">
        <UploadPickerContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
