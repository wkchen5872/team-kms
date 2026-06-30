/**
 * SSRF guard for source URLs, generalized from the Python converter's
 * `_validate_s3_url`. The original locked to `*.amazonaws.com`; we also allow
 * the configured S3-compatible endpoint host (Supabase Storage / MinIO).
 *
 * Throws an Error (message used for the 400 response) when the URL is not an
 * allowed source. The bucket must appear either as a vhost prefix
 * (`{bucket}.host`) or in the path (`/{bucket}/...`).
 */
export interface SsrfOptions {
  bucket?: string;
  /** Configured S3 endpoint (e.g. http://127.0.0.1:54321/storage/v1/s3). */
  endpoint?: string;
}

export function validateSourceUrl(rawUrl: string, opts: SsrfOptions = {}): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  const host = url.hostname;
  if (!host) throw new Error("URL has no hostname");

  const endpointHost = opts.endpoint ? safeHost(opts.endpoint) : null;
  const isEndpoint = endpointHost != null && url.host === endpointHost;
  const isAws = host.endsWith(".amazonaws.com");
  if (!isEndpoint && !isAws) {
    throw new Error("URL host is not an allowed S3 source");
  }

  if (!opts.bucket) return; // no bucket configured → host check only (less strict)

  const vhostOk = host.startsWith(`${opts.bucket}.`);
  const pathOk = url.pathname.includes(`/${opts.bucket}/`) || url.pathname.startsWith(`/${opts.bucket}/`);
  if (!vhostOk && !pathOk) {
    throw new Error("URL does not reference the configured bucket");
  }
}

function safeHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}
