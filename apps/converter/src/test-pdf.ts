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

/** Single-page PDF with a real embedded WxH DeviceRGB image (for image-extraction tests). */
export function makeImagePdf(w = 200, h = 200): Buffer {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    raw[i] = x % 256; raw[i + 1] = y % 256; raw[i + 2] = 128;
  }
  const content = `q ${w} 0 0 ${h} 100 400 cm /Im0 Do Q`;
  const objs: string[] = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</XObject<</Im0 5 0 R>>>>>>",
    `<</Length ${content.length}>>stream\n${content}\nendstream`,
    `<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Length ${raw.length}>>`,
  ];
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let pos = parts[0]!.length;
  objs.forEach((o, i) => {
    offsets[i] = pos;
    const chunk =
      i === 4
        ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o}stream\n`, "latin1"), raw, Buffer.from("\nendstream\nendobj\n", "latin1")])
        : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
    parts.push(chunk);
    pos += chunk.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  parts.push(Buffer.from(`${xref}trailer<</Root 1 0 R/Size ${objs.length + 1}>>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}
