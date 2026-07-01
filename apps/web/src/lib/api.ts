const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

/** Thrown by apiFetch on non-2xx responses. Callers can branch on `.status`. */
export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    const message = body.detail ?? body.error ?? `API error: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** WebSocket URL for real-time document updates (token passed as query param). */
export function getDocumentsWsUrl(kbId: string, token: string): string {
  return `${WS_URL}/v1/ws/kb/${kbId}?token=${encodeURIComponent(token)}`;
}

export type { KnowledgeBase, DocumentListItem, WikiNode } from "./types";
