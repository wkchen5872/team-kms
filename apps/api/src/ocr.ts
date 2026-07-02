/**
 * Pluggable image OCR. Runs in the ingest layer (has provider keys) — never in
 * the converter. `ocrProviderFromEnv()` returns null when disabled, so the
 * backend stays zero-LLM by default. Failures degrade gracefully (return
 * undefined) so a flaky provider never fails a document ingest.
 */
import type { ExtractedImage } from "@team-kms/shared";

export interface OcrProvider {
  readonly name: string;
  /** Extract text/description from an image. Throws on hard provider errors. */
  ocrImage(bytes: Buffer, mime: string): Promise<{ text: string }>;
}

const PROMPT =
  "Extract all text from this image verbatim. If it is a table, flowchart, or " +
  "diagram, also transcribe its structure and the key data it conveys. Output plain text only.";

class MistralProvider implements OcrProvider {
  readonly name = "mistral";
  constructor(private readonly apiKey: string, private readonly fetchFn: typeof fetch = globalThis.fetch) { }

  async ocrImage(bytes: Buffer, mime: string): Promise<{ text: string }> {
    const res = await this.fetchFn("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "image_url", image_url: `data:${mime};base64,${bytes.toString("base64")}` },
      }),
    });
    if (!res.ok) throw new Error(`mistral ocr ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const body = (await res.json()) as { pages?: { markdown?: string }[] };
    return { text: (body.pages ?? []).map((p) => p.markdown ?? "").join("\n\n").trim() };
  }
}

class GeminiProvider implements OcrProvider {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-3-flash-preview",
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) { }

  async ocrImage(bytes: Buffer, mime: string): Promise<{ text: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: { mime_type: mime, data: bytes.toString("base64") },
              mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' }
            },
            { text: PROMPT }
          ]
        }],
      }),
    });
    if (!res.ok) throw new Error(`gemini ocr ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return { text };
  }
}

/** Select an OCR provider from env; null = disabled (no LLM calls). */
export function ocrProviderFromEnv(env: NodeJS.ProcessEnv = process.env): OcrProvider | null {
  const which = (env.OCR_PROVIDER ?? "none").toLowerCase();
  if (which === "mistral" && env.MISTRAL_API_KEY) return new MistralProvider(env.MISTRAL_API_KEY);
  if (which === "gemini" && env.GEMINI_API_KEY) return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  return null;
}

/** OCR a single image's bytes; returns undefined on any failure (graceful). */
export async function ocrImageBytes(
  ocr: OcrProvider | null,
  bytes: Buffer,
  format: string,
): Promise<string | undefined> {
  if (!ocr) return undefined;
  try {
    const { text } = await ocr.ocrImage(bytes, `image/${format}`);
    return text || undefined;
  } catch {
    return undefined;
  }
}

/** Fill `ocrText` on every page image (graceful per image). Mutates + returns pages. */
export async function ocrPageImages<T extends { images: ExtractedImage[] }>(
  ocr: OcrProvider | null,
  pages: T[],
): Promise<T[]> {
  if (!ocr) return pages;
  for (const page of pages) {
    for (const img of page.images ?? []) {
      img.ocrText = await ocrImageBytes(ocr, Buffer.from(img.dataBase64, "base64"), img.format);
    }
  }
  return pages;
}
