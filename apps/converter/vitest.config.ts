import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      CONVERTER_SECRET: "test-secret",
      S3_BUCKET: "team-kms-assets",
      S3_ENDPOINT: "http://127.0.0.1:54321/storage/v1/s3",
      // macOS LibreOffice binary; the Docker image provides `libreoffice`.
      LIBREOFFICE_BIN: "soffice",
    },
  },
});
