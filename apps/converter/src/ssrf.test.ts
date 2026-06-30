import { describe, it, expect } from "vitest";
import { validateSourceUrl } from "./ssrf.js";

const opts = { bucket: "team-kms-assets", endpoint: "http://127.0.0.1:54321/storage/v1/s3" };

describe("validateSourceUrl", () => {
  it("accepts a path-style URL on the configured endpoint with the bucket", () => {
    expect(() =>
      validateSourceUrl("http://127.0.0.1:54321/storage/v1/s3/team-kms-assets/u/doc/source.pdf?X-Amz=1", opts),
    ).not.toThrow();
  });

  it("accepts an AWS vhost-style bucket URL", () => {
    expect(() =>
      validateSourceUrl("https://team-kms-assets.s3.us-east-1.amazonaws.com/u/doc/source.pdf", opts),
    ).not.toThrow();
  });

  it("rejects a foreign host (SSRF)", () => {
    expect(() => validateSourceUrl("http://169.254.169.254/latest/meta-data/", opts)).toThrow();
    expect(() => validateSourceUrl("https://evil.com/team-kms-assets/x", opts)).toThrow();
  });

  it("rejects an endpoint URL that omits the bucket", () => {
    expect(() => validateSourceUrl("http://127.0.0.1:54321/storage/v1/s3/other-bucket/x", opts)).toThrow();
  });

  it("rejects a non-URL", () => {
    expect(() => validateSourceUrl("not a url", opts)).toThrow();
  });
});
