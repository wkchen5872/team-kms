"use client";

import * as React from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useUserStore } from "@/stores";

/** Minimal markdown note editor (tiptap replacement): loads content, saves on
 *  blur via PATCH /v1/documents/:id { content }. */
export function NoteEditor({ documentId }: { documentId: string }) {
  const token = useUserStore((s) => s.accessToken);
  const [content, setContent] = React.useState<string | null>(null);
  const savedRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ content: string }>(`/v1/documents/${documentId}/content`, token)
      .then((res) => {
        if (!cancelled) {
          setContent(res.content ?? "");
          savedRef.current = res.content ?? "";
        }
      })
      .catch(() => {
        if (!cancelled) setContent("");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, token]);

  async function save() {
    if (!token || content === null || content === savedRef.current) return;
    try {
      await apiFetch(`/v1/documents/${documentId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
      savedRef.current = content;
    } catch {
      toast.error("Failed to save note");
    }
  }

  if (content === null) return null;

  return (
    <div className="mx-auto h-full max-w-3xl px-8 py-6">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={save}
        spellCheck={false}
        className="h-full w-full resize-none bg-transparent font-mono text-sm leading-relaxed outline-none"
        placeholder="Write markdown…"
      />
    </div>
  );
}
