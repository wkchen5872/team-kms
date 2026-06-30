"use client";
import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
}
export interface DocumentMeta {
  id: string;
  filename: string;
  title: string | null;
  path: string;
  file_type: string;
}
export interface GraphData {
  nodes: (DocumentMeta & { id: string })[];
  edges: { source_document_id: string; target_document_id: string; reference_type: string }[];
}
