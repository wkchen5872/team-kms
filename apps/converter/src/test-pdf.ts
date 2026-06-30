/** Minimal valid single-page PDF generator (correct xref offsets) for tests. */
export function makePdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets[i] = Buffer.byteLength(body, "latin1");
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefOff = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer<</Root 1 0 R/Size ${objs.length + 1}>>\nstartxref\n${xrefOff}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
