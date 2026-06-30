/**
 * Office (doc/docx/ppt/pptx) → PDF via the LibreOffice binary, ported from the
 * Python converter's `_convert_to_pdf`. Requires LibreOffice installed on the
 * host (used only for Office sources; PDF/text never touch this path).
 */
import { spawn } from "node:child_process";
import { join, parse } from "node:path";
import { access } from "node:fs/promises";

const CONVERT_TIMEOUT_MS = 120_000;
// `libreoffice` in the Docker image; `soffice` from a macOS LibreOffice install.
const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN ?? "libreoffice";

export async function officeToPdf(sourcePath: string, tmpDir: string): Promise<string> {
  // A per-conversion profile avoids headless profile-lock contention that
  // leaves zombie soffice/Java processes under concurrency.
  const profile = `file://${tmpDir}/lo-profile`;
  await runKillable(
    LIBREOFFICE_BIN,
    [
      `-env:UserInstallation=${profile}`,
      "--headless",
      "--norestore",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      tmpDir,
      sourcePath,
    ],
    CONVERT_TIMEOUT_MS,
  );
  const pdfPath = join(tmpDir, `${parse(sourcePath).name}.pdf`);
  try {
    await access(pdfPath);
  } catch {
    throw new Error("LibreOffice did not produce a PDF");
  }
  return pdfPath;
}

function runKillable(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      // Kill the whole process group (negative pid) — soffice spawns a JVM.
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(0, 500)}`));
    });
  });
}
