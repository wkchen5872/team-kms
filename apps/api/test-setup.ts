import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load repo-root .env before any test module imports services that read env.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // ambient env
}
