"use client";

import * as React from "react";
import { apiFetch, getDocumentsWsUrl } from "@/lib/api";
import { useUserStore } from "@/stores";
import type { DocumentListItem } from "@/lib/types";

const WS_RECONNECT_BASE = 1000;
const WS_RECONNECT_MAX = 30000;
const DEBOUNCE_MS = 300;

const IDENTITY_FIELDS: ReadonlyArray<keyof DocumentListItem> = [
  "id", "filename", "title", "path", "file_type", "status", "archived",
  "tags", "date", "metadata", "version", "document_number", "error_message",
];

function shallowEqualForIdentity(a: DocumentListItem, b: DocumentListItem): boolean {
  for (const k of IDENTITY_FIELDS) {
    const av = a[k];
    const bv = b[k];
    if (av === bv) continue;
    if (typeof av === "object" || typeof bv === "object") {
      if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function mergePreservingIdentity(prev: DocumentListItem[], next: DocumentListItem[]): DocumentListItem[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((d) => [d.id, d]));
  let allSame = prev.length === next.length;
  const merged = next.map((nextDoc, i) => {
    const prevDoc = prevById.get(nextDoc.id);
    const result = prevDoc && shallowEqualForIdentity(prevDoc, nextDoc) ? prevDoc : nextDoc;
    if (result !== prev[i]) allSame = false;
    return result;
  });
  return allSame ? prev : merged;
}

export function useKBDocuments(knowledgeBaseId: string) {
  const [documents, setDocuments] = React.useState<DocumentListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const accessToken = useUserStore((s) => s.accessToken);
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = React.useRef(WS_RECONNECT_BASE);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDocs = React.useCallback(async () => {
    if (!knowledgeBaseId || !accessToken) return;
    try {
      const data = await apiFetch<DocumentListItem[]>(`/v1/knowledge-bases/${knowledgeBaseId}/documents`, accessToken);
      setDocuments((prev) => mergePreservingIdentity(prev, data));
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }, [knowledgeBaseId, accessToken]);

  React.useEffect(() => {
    if (!knowledgeBaseId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDocs().finally(() => setLoading(false));
  }, [knowledgeBaseId, fetchDocs]);

  // Real-time updates via WebSocket (token passed as query param).
  React.useEffect(() => {
    if (!knowledgeBaseId || !accessToken) return;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(getDocumentsWsUrl(knowledgeBaseId, accessToken!));
      wsRef.current = ws;
      ws.onopen = () => {
        reconnectDelay.current = WS_RECONNECT_BASE;
      };
      ws.onmessage = () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(fetchDocs, DEBOUNCE_MS);
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, WS_RECONNECT_MAX);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [knowledgeBaseId, accessToken, fetchDocs]);

  const refetchDocuments = React.useCallback(() => {
    fetchDocs();
  }, [fetchDocs]);

  return { documents, setDocuments, loading, refetchDocuments };
}
