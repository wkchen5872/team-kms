import { describe, it, expect } from "vitest";
import { S3Service } from "./s3.js";

// Offline: presigned-URL generation is pure client-side signing (no network).
// Live upload/download is exercised in the ingest integration (group 4).
const svc = new S3Service({
  region: "us-east-1",
  bucket: "team-kms-assets",
  endpoint: "http://127.0.0.1:54321/storage/v1/s3",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
});

describe("S3Service presigning", () => {
  it("signs a GET url containing bucket, key and signature", async () => {
    const url = await svc.generatePresignedGet("sources/abc.pdf");
    expect(url).toContain("team-kms-assets");
    expect(url).toContain("sources/abc.pdf");
    expect(url).toContain("X-Amz-Signature");
  });

  it("signs a PUT url with an expiry", async () => {
    const url = await svc.generatePresignedPut("sources/new.pdf", "application/pdf", 600);
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain("X-Amz-Expires=600");
  });
});
