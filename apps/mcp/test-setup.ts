import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // ambient env
}
