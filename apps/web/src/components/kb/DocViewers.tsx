"use client";

import * as React from "react";
import { Loader2, FileText } from "lucide-react";
import { useUserStore } from "@/stores";
import { apiFetch } from "@/lib/api";

function useDocumentUrl(documentId: string) {
  const token = useUserStore((s) => s.accessToken);
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ url: string }>(`/v1/documents/${documentId}/source-url`, token)
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, token]);

  return { url, error };
}

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

export function PdfDocViewer({ documentId }: { documentId: string; title?: string; initialPage?: number; hideToolbar?: boolean }) {
  const { url, error } = useDocumentUrl(documentId);
  if (error) return <ErrorMessage message="Failed to load PDF" />;
  if (!url) return <LoadingSpinner />;
  return <embed src={url} type="application/pdf" className="h-full w-full" />;
}

export function ImageViewer({ documentId, title }: { documentId: string; title: string }) {
  const { url, error } = useDocumentUrl(documentId);
  if (error) return <ErrorMessage message="Failed to load image" />;
  if (!url) return <LoadingSpinner />;
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="max-h-full max-w-full rounded-md object-contain" />
    </div>
  );
}

export function ContentViewer({ documentId, title, fileType }: { documentId: string; title: string; fileType: string }) {
  const token = useUserStore((s) => s.accessToken);
  const [content, setContent] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ content: string }>(`/v1/documents/${documentId}/content`, token)
      .then((res) => {
        if (!cancelled) setContent(res.content ?? "");
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, token]);

  if (error) return <ErrorMessage message="Failed to load content" />;
  if (content === null) return <LoadingSpinner />;

  const isHtml = fileType === "html" || fileType === "htm";
  return (
    <div className="flex h-full flex-col">
      {isHtml ? (
        <iframe srcDoc={content} sandbox="allow-same-origin" className="w-full flex-1 bg-white" title={title} />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-8 py-6">
            <pre className="whitespace-pre-wrap font-mono text-sm">{content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Web-clip HTML view was dropped in this port; fall back to raw content. */
export function HtmlDocViewer({ documentId, title }: { documentId: string; title: string }) {
  return <ContentViewer documentId={documentId} title={title} fileType="html" />;
}

export function UnsupportedViewer({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-16 items-center justify-center rounded-xl bg-muted">
        <FileText size={28} className="text-muted-foreground" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">File viewer coming soon</p>
      </div>
    </div>
  );
}

export function ProcessingViewer({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <div className="text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Processing document...</p>
      </div>
    </div>
  );
}

export function FailedViewer({ title, errorMessage }: { title: string; errorMessage?: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-16 items-center justify-center rounded-xl bg-destructive/10">
        <FileText size={28} className="text-destructive" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="mt-2 text-xs text-destructive">Processing failed</p>
        {errorMessage && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{errorMessage}</p>}
      </div>
    </div>
  );
}
