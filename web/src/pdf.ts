// The legacy build carries polyfills for very new language features that the
// modern build assumes (e.g. Map.prototype.getOrInsertComputed), so it works in
// a wider range of browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
export const TextLayer = pdfjs.TextLayer;

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data }).promise;
}
