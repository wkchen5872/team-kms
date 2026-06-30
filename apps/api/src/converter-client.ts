/** HTTP client for the converter service. */
export interface PageContent {
  page: number;
  content: string;
}

export interface ConverterClient {
  extract(sourceUrl: string, ext: string): Promise<PageContent[]>;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class HttpConverterClient implements ConverterClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchFn: FetchFn = globalThis.fetch,
  ) {}

  async extract(sourceUrl: string, ext: string): Promise<PageContent[]> {
    const res = await this.fetchFn(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ source_url: sourceUrl, source_ext: ext }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`converter /extract failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { pages: PageContent[] };
    return body.pages;
  }
}
