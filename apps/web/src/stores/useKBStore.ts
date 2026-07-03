import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { useUserStore } from "./useUserStore";
import type { KnowledgeBase } from "@/lib/types";

type KBState = {
  knowledgeBases: KnowledgeBase[];
  loading: boolean;
  error: string | null;
  fetchKBs: (options?: { throwOnError?: boolean }) => Promise<KnowledgeBase[]>;
  createKB: (name: string, description?: string) => Promise<KnowledgeBase>;
  deleteKB: (id: string) => Promise<void>;
  renameKB: (id: string, name: string) => Promise<void>;
  updateKBPrompt: (id: string, projectPrompt: string) => Promise<void>;
};

function getToken(): string {
  const token = useUserStore.getState().accessToken;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const useKBStore = create<KBState>((set, get) => ({
  knowledgeBases: [],
  loading: true,
  error: null,

  fetchKBs: async (options) => {
    const hadData = get().knowledgeBases.length > 0;
    set({ loading: !hadData, error: null });
    try {
      const data = await apiFetch<KnowledgeBase[]>("/v1/knowledge-bases", getToken());
      set({ knowledgeBases: data, loading: false });
      return data;
    } catch (err) {
      set({ error: hadData ? null : (err as Error).message, loading: false });
      if (options?.throwOnError) throw err;
      return hadData ? get().knowledgeBases : [];
    }
  },

  createKB: async (name, description) => {
    const kb = await apiFetch<KnowledgeBase>("/v1/knowledge-bases", getToken(), {
      method: "POST",
      body: JSON.stringify({ name, description: description || undefined }),
    });
    set({ knowledgeBases: [kb, ...get().knowledgeBases] });
    return kb;
  },

  deleteKB: async (id) => {
    await apiFetch(`/v1/knowledge-bases/${id}`, getToken(), { method: "DELETE" });
    set({ knowledgeBases: get().knowledgeBases.filter((kb) => kb.id !== id) });
  },

  renameKB: async (id, name) => {
    const updated = await apiFetch<KnowledgeBase>(`/v1/knowledge-bases/${id}`, getToken(), {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    set({ knowledgeBases: get().knowledgeBases.map((kb) => (kb.id === id ? updated : kb)) });
  },

  updateKBPrompt: async (id, projectPrompt) => {
    const updated = await apiFetch<KnowledgeBase>(`/v1/knowledge-bases/${id}`, getToken(), {
      method: "PATCH",
      body: JSON.stringify({ project_prompt: projectPrompt }),
    });
    set({ knowledgeBases: get().knowledgeBases.map((kb) => (kb.id === id ? updated : kb)) });
  },
}));
