import { buildPageText, type PageDims } from '@reader/shared';

export interface ExtractedPdf {
  pageCount: number;
  pageDims: PageDims[];
  pages: string[]; // canonical text per page
  scanned: boolean;
  title: string | null;
}

// Loaded lazily so the module import cost is paid on first upload, not at boot.
let pdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function pdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function extractPdf(data: Uint8Array, maxPages: number): Promise<ExtractedPdf> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    if (doc.numPages > maxPages) throw new Error(`PDF has ${doc.numPages} pages; the limit is ${maxPages}`);
    const pageDims: PageDims[] = [];
    const pages: string[] = [];
    let textChars = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      pageDims.push({ w: vp.width, h: vp.height });
      const content = await page.getTextContent();
      const items = content.items.filter((i): i is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in i);
      const { text } = buildPageText(items);
      pages.push(text);
      textChars += text.replace(/\s/g, '').length;
      page.cleanup();
    }
    let title: string | null = null;
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as Record<string, unknown>;
      if (typeof info?.Title === 'string' && info.Title.trim()) title = info.Title.trim();
    } catch {
      /* ignore */
    }
    return {
      pageCount: doc.numPages,
      pageDims,
      pages,
      scanned: textChars < 20 * doc.numPages,
      title,
    };
  } finally {
    await doc.destroy();
  }
}
