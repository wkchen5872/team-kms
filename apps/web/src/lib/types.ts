export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
}

/** A document row as returned by GET /v1/knowledge-bases/:slug/documents. */
export interface DocumentListItem {
  id: string;
  filename: string;
  title: string | null;
  path: string;
  file_type: string;
  kind: "raw" | "wiki" | "asset";
  status?: string;
  archived?: boolean;
  tags?: string[];
  date?: string | null;
  metadata?: Record<string, unknown> | null;
  version?: number;
  document_number?: number | null;
  error_message?: string | null;
  file_size?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

/** A node in the wiki sidebar file tree (built client-side from paths). */
export interface WikiNode {
  title: string;
  path?: string;
  docNumber?: number | null;
  children?: WikiNode[];
}
