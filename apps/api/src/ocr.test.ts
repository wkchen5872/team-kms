import { describe, it, expect, vi, afterEach } from "vitest";
import type { ExtractedImage } from "@team-kms/shared";
import { ocrProviderFromEnv, ocrImageBytes, ocrPageImages } from "./ocr.js";

const IMG = Buffer.from("iVBORw0KGgo=", "base64");

afterEach(() => vi.unstubAllGlobals());

describe("ocrProviderFromEnv", () => {
  it("returns null when disabled or key missing", () => {
    expect(ocrProviderFromEnv({})).toBeNull();
    expect(ocrProviderFromEnv({ OCR_PROVIDER: "none" })).toBeNull();
    expect(ocrProviderFromEnv({ OCR_PROVIDER: "mistral" })).toBeNull(); // no key
    expect(ocrProviderFromEnv({ OCR_PROVIDER: "gemini" })).toBeNull(); // no key
  });

  it("selects mistral / gemini when configured", () => {
    expect(ocrProviderFromEnv({ OCR_PROVIDER: "mistral", MISTRAL_API_KEY: "k" })?.name).toBe("mistral");
    expect(ocrProviderFromEnv({ OCR_PROVIDER: "gemini", GEMINI_API_KEY: "k" })?.name).toBe("gemini");
  });
});

describe("ocrImageBytes (graceful)", () => {
  it("returns undefined when no provider", async () => {
    expect(await ocrImageBytes(null, IMG, "png")).toBeUndefined();
  });

  it("returns undefined when the provider throws (does not propagate)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const ocr = ocrProviderFromEnv({ OCR_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(await ocrImageBytes(ocr, IMG, "png")).toBeUndefined();
  });

  it("returns undefined on non-2xx (does not propagate)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    const ocr = ocrProviderFromEnv({ OCR_PROVIDER: "mistral", MISTRAL_API_KEY: "k" });
    expect(await ocrImageBytes(ocr, IMG, "png")).toBeUndefined();
  });

  it("normalizes a Gemini response to text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ candidates: [{ content: { parts: [{ text: "Revenue: 42" }] } }] }),
      ),
    );
    const ocr = ocrProviderFromEnv({ OCR_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(await ocrImageBytes(ocr, IMG, "png")).toBe("Revenue: 42");
  });

  it("normalizes a Mistral OCR response to text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ pages: [{ markdown: "| A | B |" }] })),
    );
    const ocr = ocrProviderFromEnv({ OCR_PROVIDER: "mistral", MISTRAL_API_KEY: "k" });
    expect(await ocrImageBytes(ocr, IMG, "png")).toBe("| A | B |");
  });
});

describe("ocrPageImages", () => {
  it("fills ocrText per image and is a no-op without a provider", async () => {
    const pages: { page: number; content: string; images: ExtractedImage[] }[] = [
      { page: 1, content: "", images: [{ id: "i1", dataBase64: "aGk=", format: "png" }] },
    ];
    expect((await ocrPageImages(null, pages))[0]!.images[0]!.ocrText).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ pages: [{ markdown: "hi" }] })));
    const ocr = ocrProviderFromEnv({ OCR_PROVIDER: "mistral", MISTRAL_API_KEY: "k" });
    await ocrPageImages(ocr, pages);
    expect(pages[0]!.images[0]!.ocrText).toBe("hi");
  });
});
