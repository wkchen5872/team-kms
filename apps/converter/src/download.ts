/** Stream a source URL to disk, bounded by a byte cap. */
import { createWriteStream } from "node:fs";

export async function downloadToFile(url: string, dest: string, maxBytes: number): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not fetch source (HTTP ${resp.status})`);
  if (!resp.body) throw new Error("Source response had no body");

  const out = createWriteStream(dest);
  let total = 0;
  try {
    const reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        throw new Error(`Source exceeds ${maxBytes} bytes`);
      }
      if (!out.write(value)) {
        await new Promise<void>((res) => out.once("drain", res));
      }
    }
  } finally {
    out.end();
  }
  await new Promise<void>((res, rej) => {
    out.on("finish", res);
    out.on("error", rej);
  });
}
