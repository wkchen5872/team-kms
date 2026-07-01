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
  const itemBtn = (active: boolean) =>
    `block w-full truncate text-left text-sm ${active ? "font-semibold text-blue-700" : "text-blue-600 hover:underline"}`;

  return (
    <main className="mx-auto flex max-w-7xl gap-6 p-6">
      <nav className="w-60 flex-shrink-0 space-y-3">
        <Link href="/wikis" className="text-sm text-gray-500 hover:underline">
          ← all wikis
        </Link>
        <h3 className="text-lg font-bold">{slug}</h3>
        <Link href={`/wikis/${slug}/graph`} className="block text-sm text-blue-600 hover:underline">
          📊 graph
        </Link>
        <div>
          <label className="cursor-pointer text-sm text-blue-600 hover:underline">
            {uploading ? `Uploading ${progress}…` : "📎 Upload sources"}
            <input type="file" multiple onChange={onUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Wiki</h4>
          <ul className="space-y-0.5">
            {wikiPages.map((d) => (
              <li key={d.id}>
                <button onClick={() => selectDoc(d)} className={itemBtn(selected?.id === d.id)}>
                  {d.path.replace("/wiki/", "")}
                  {d.filename}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sources.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Sources</h4>
            <ul className="space-y-0.5">
              {sources.map((d) => (
                <li key={d.id}>
                  <button onClick={() => selectDoc(d)} className={itemBtn(selected?.id === d.id)}>
                    {d.filename}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      <article className="min-w-0 flex-grow rounded-lg bg-white p-8 shadow-sm">
        {selected?.file_type === "pdf" ? (
          <PdfViewer docId={selected.id} />
        ) : (
          <div className="prose prose-slate max-w-none prose-pre:bg-gray-100 prose-pre:text-gray-800">
            <WikiContent content={content} onNavigate={navigateToHref} />
          </div>
        )}
      </article>
    </main>
  );
}
