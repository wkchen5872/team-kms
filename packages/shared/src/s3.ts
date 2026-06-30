/**
 * S3 binary asset storage, ported from llmwiki `api/services/s3.py`
 * (aioboto3 → AWS SDK v3). Works against AWS S3 or any S3-compatible endpoint
 * (Supabase Storage, MinIO) via `endpoint` + `forcePathStyle`.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadConfig, type Config } from "./config.js";

export interface S3Options {
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3Options) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint || undefined,
      // Path-style is required for Supabase Storage / MinIO style endpoints.
      forcePathStyle: opts.forcePathStyle ?? Boolean(opts.endpoint),
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    });
  }

  /** Create the bucket if it does not already exist (idempotent). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })).catch(() => {});
    }
  }

  async uploadBytes(key: string, data: Uint8Array, contentType = "application/octet-stream"): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  async uploadFile(key: string, filePath: string, contentType = "application/octet-stream"): Promise<void> {
    await this.uploadBytes(key, await readFile(filePath), contentType);
  }

  async generatePresignedGet(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  async generatePresignedPut(key: string, contentType = "application/pdf", expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    let token: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      for (let i = 0; i < objects.length; i += 1000) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects.slice(i, i + 1000) } }),
        );
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }

  async downloadBytes(key: string): Promise<Buffer> {
    const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await resp.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async downloadToFile(key: string, filePath: string): Promise<void> {
    await writeFile(filePath, await this.downloadBytes(key));
  }

  async downloadJson<T = unknown>(key: string): Promise<T> {
    const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return JSON.parse(await resp.Body!.transformToString()) as T;
  }
}

/** Build an S3Service from the shared Config. */
export function s3FromConfig(cfg: Config = loadConfig()): S3Service {
  return new S3Service({
    region: cfg.AWS_REGION,
    bucket: cfg.S3_BUCKET ?? "",
    endpoint: cfg.S3_ENDPOINT,
    accessKeyId: cfg.AWS_ACCESS_KEY_ID,
    secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
  });
}
