/** Bridge the pure reference parser to the VaultFS graph (ported update_references). */
import {
  buildLookupMaps,
  extractReferences,
  type PostgresVaultFS,
  type RefDoc,
} from "@team-kms/shared";

export async function updateReferences(
  fs: PostgresVaultFS,
  kbId: string,
  docId: string,
  content: string,
  docPath: string,
): Promise<void> {
  const wikiDir = docPath.startsWith("/wiki/") ? docPath.replace("/wiki/", "") : "";
  const allDocs = (await fs.listDocuments(kbId)) as unknown as RefDoc[];
  const { filenameToDoc, baseToDoc, wikiPathToDoc } = buildLookupMaps(allDocs);
  const edges = extractReferences(content, docId, wikiDir, filenameToDoc, baseToDoc, wikiPathToDoc);

  await fs.deleteReferences(docId);
  for (const edge of edges) {
    await fs.upsertReference(docId, edge.targetId, kbId, edge.type, edge.page);
  }
}

export async function backlinksSummary(fs: PostgresVaultFS, docId: string): Promise<string> {
  const rows = await fs.getBacklinks(docId);
  if (!rows.length) return "";
  const lines = [`\n---\n**Referenced by (${rows.length}):**`];
  for (const r of rows) {
    const title = (r.title as string) || (r.filename as string);
    lines.push(`  - ${title} (${r.reference_type as string})`);
  }
  return lines.join("\n");
}
