// Generates a small, valid two-page PDF with real text (standard Helvetica) for tests.
import fs from 'node:fs';

const pages = [
  [
    'Attention Is Not All You Need: A Study of Reading Together',
    'Abstract. We observe a 3.2x speedup over the baseline when readers',
    'share cursors and selections in real time. This paper describes the',
    'method, the evaluation, and the limitations of synchronous reading.',
    '1. Introduction',
    'Reading groups today rely on screen sharing. The presenter has all',
    'the agency and nothing anyone says is anchored to the text afterwards.',
  ],
  [
    '2. Method',
    'Each participant sees a cursor for every other participant, drawn in',
    'page-space coordinates so that positions are independent of zoom.',
    'Highlights are anchored using text quote and position selectors.',
    '3. Results',
    'Groups completed the reading 3.2x faster and reported fewer moments',
    'of confusion about which passage was under discussion.',
  ],
];

const objs = [];
const add = (s) => (objs.push(s), objs.length);
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const pageIds = [];
const contentIds = [];
for (const lines of pages) {
  let y = 740;
  const ops = ['BT', '/F1 12 Tf', '14 TL', `72 ${y} Td`];
  for (const line of lines) ops.push(`(${line.replace(/[()\\]/g, (m) => '\\' + m)}) Tj T*`);
  ops.push('ET');
  const stream = ops.join('\n');
  contentIds.push(add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
  pageIds.push(objs.length + 1);
  add('PLACEHOLDER');
}
const pagesId = objs.length + 1;
pageIds.forEach((id, i) => {
  objs[id - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
});
add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
add('<< /Title (Reading Together Fixture) >>');
const infoId = objs.length;

let out = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(Buffer.byteLength(out));
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(out);
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(new URL('./fixtures/paper.pdf', import.meta.url), out);
console.log('wrote test/fixtures/paper.pdf', Buffer.byteLength(out), 'bytes');
