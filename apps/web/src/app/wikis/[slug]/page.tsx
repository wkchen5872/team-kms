"use client";
import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type DocumentMeta } from "@/lib/api";
import WikiContent from "@/components/WikiContent";
import PdfViewer from "@/components/PdfViewer";

export default function WikiPage() {
  const slug = String(useParams().slug);
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [selected, setSelected] = useState<DocumentMeta | null>(null);
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  async function refreshDocs() {
    const d = await apiFetch<DocumentMeta[]>(`/v1/knowledge-bases/${slug}/documents`);
    setDocs(d);
    return d;
  }

  // Switch article and reflect it in the URL (?doc=<id>) so refresh/share land on the same page.
  function selectDoc(doc: DocumentMeta | null) {
    setSelected(doc);
    router.replace(doc ? `/wikis/${slug}?doc=${doc.id}` : `/wikis/${slug}`);
  }

  useEffect(() => {
    refreshDocs().then((d) => {
      const wanted = new URLSearchParams(window.location.search).get("doc");
      const doc =
        (wanted && d.find((x) => x.id === wanted)) ||
        d.find((x) => x.path === "/wiki/" && x.filename === "overview.md") ||
        d[0] ||
        null;
      selectDoc(doc);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    const failed: string[] = [];
    try {
      // Sequential — the converter caps concurrent extractions, so don't flood it.
      for (let i = 0; i < files.length; i++) {
        setProgress(`${i + 1}/${files.length}`);
        const form = new FormData();
        form.append("file", files[i]);
        try {
          await apiFetch(`/v1/knowledge-bases/${slug}/upload`, { method: "POST", body: form });
        } catch {
          failed.push(files[i].name);
        }
      }
      await refreshDocs();
      if (failed.length) alert(`Failed to upload: ${failed.join(", ")}`);
    } finally {
      setUploading(false);
      setProgress("");
      e.target.value = "";
    }
  }

  useEffect(() => {
    if (selected && selected.file_type !== "pdf") {
      apiFetch<{ content: string }>(`/v1/documents/${selected.id}/content`).then((r) => setContent(r.content));
    }
  }, [selected]);

  // Resolve an in-wiki link (VaultFS path like /wiki/entities/foo.md) to a doc and
  // switch the article in-place, instead of letting the browser 404 on a fake route.
  function navigateToHref(href: string): boolean {
    const clean = href.split(/[?#]/)[0];
    const idx = clean.lastIndexOf("/");
    const path = clean.slice(0, idx + 1);
    const filename = decodeURIComponent(clean.slice(idx + 1));
    const doc = docs.find((d) => d.path === path && d.filename === filename);
    if (doc) {
      selectDoc(doc);
      return true;
    }
    return false;
  }

  const wikiPages = docs.filter((d) => d.path.startsWith("/wiki/"));
  const sources = docs.filter((d) => !d.path.startsWith("/wiki/"));
  const btn = { cursor: "pointer", border: 0, background: "none", padding: 0, color: "#0366d6" } as const;

  return (
    <main style={{ display: "flex", gap: 24, padding: 24 }}>
      <nav style={{ width: 240, flexShrink: 0 }}>
        <Link href="/wikis">← all wikis</Link>
        <h3>{slug}</h3>
        <Link href={`/wikis/${slug}/graph`}>📊 graph</Link>
        <div style={{ margin: "12px 0" }}>
          <label style={{ cursor: "pointer", color: "#0366d6" }}>
            {uploading ? `Uploading ${progress}…` : "📎 Upload sources"}
            <input type="file" multiple onChange={onUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        </div>
        <h4>Wiki</h4>
        <ul style={{ paddingLeft: 16 }}>
          {wikiPages.map((d) => (
            <li key={d.id}>
              <button onClick={() => selectDoc(d)} style={btn}>
                {d.path.replace("/wiki/", "")}
                {d.filename}
              </button>
            </li>
          ))}
        </ul>
        {sources.length > 0 && (
          <>
            <h4>Sources</h4>
            <ul style={{ paddingLeft: 16 }}>
              {sources.map((d) => (
                <li key={d.id}>
                  <button onClick={() => selectDoc(d)} style={btn}>
                    {d.filename}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
      <article style={{ maxWidth: 820, lineHeight: 1.6, flexGrow: 1 }}>
        {selected?.file_type === "pdf" ? (
          <PdfViewer docId={selected.id} />
        ) : (
          <WikiContent content={content} onNavigate={navigateToHref} />
        )}
      </article>
    </main>
  );
}
