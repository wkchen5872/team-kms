/**
 * Relays Postgres `document_changes` NOTIFY events (migration 003) to
 * subscribers, keyed by user. The WebSocket endpoint subscribes per connection.
 */
import { listen } from "@team-kms/shared";

export interface DocChange {
  event: "INSERT" | "UPDATE" | "DELETE";
  id: string;
  knowledge_base_id: string;
  user_id: string;
}

type Subscriber = (e: DocChange) => void;
const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(userId: string, cb: Subscriber): () => void {
  const set = subscribers.get(userId) ?? new Set();
  set.add(cb);
  subscribers.set(userId, set);
  return () => {
    set.delete(cb);
    if (!set.size) subscribers.delete(userId);
  };
}

let stop: (() => Promise<void>) | null = null;

export async function startDocumentListener(onChange?: Subscriber): Promise<void> {
  if (stop) return;
  stop = await listen("document_changes", (payload) => {
    let e: DocChange;
    try {
      e = JSON.parse(payload) as DocChange;
    } catch {
      return;
    }
    onChange?.(e);
    subscribers.get(e.user_id)?.forEach((cb) => cb(e));
  });
}

export async function stopDocumentListener(): Promise<void> {
  await stop?.();
  stop = null;
}
