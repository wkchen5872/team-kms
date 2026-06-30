"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Browsers render PDFs natively — embed the presigned source URL (no pdf.js needed).
export default function PdfViewer({ docId }: { docId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ url: string }>(`/v1/documents/${docId}/source-url`).then((r) => setUrl(r.url));
  }, [docId]);

  if (!url) return <p>Loading PDF…</p>;
  return <embed src={url} type="application/pdf" style={{ width: "100%", height: "80vh", border: 0 }} />;
}
