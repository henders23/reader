import { useEffect, useRef } from 'react';
import type { PageDims, Rect } from '@reader/shared';
import { buildPageText } from '@reader/shared';
import { TextLayer, type PDFDocumentProxy } from '../pdf.ts';
import type { TextLayer as TextLayerType } from 'pdfjs-dist';
import { pageTexts } from './pageText.ts';
import { CursorLayer, LaserLayer, PinLayer, ReactionLayer, SvgLayer, ViewportLayer } from './layers.tsx';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  dims: PageDims;
  scale: number;
  active: boolean;
  dragRect: Rect | null;
}

export function Page({ pdf, pageNumber, dims, scale, active, dragRect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const width = Math.round(dims.w * scale);
  const height = Math.round(dims.h * scale);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let renderTask: { cancel(): void } | null = null;
    let textLayer: TextLayerType | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!canvas || !textDiv) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvasContext: ctx, viewport, canvas });
      try {
        await (renderTask as unknown as { promise: Promise<void> }).promise;
      } catch {
        return; // cancelled
      }
      if (cancelled) return;

      const content = await page.getTextContent();
      if (cancelled) return;
      pageTexts.set(pageNumber, buildPageText(content.items.filter((i) => 'str' in i) as { str: string; hasEOL: boolean }[]));
      textDiv.replaceChildren();
      textLayer = new TextLayer({ textContentSource: content, container: textDiv, viewport });
      await textLayer.render();
      if (cancelled) return;
      textLayer.textDivs.forEach((div: HTMLElement, i: number) => (div.dataset.i = String(i)));
    })().catch((e) => console.error('page render failed', e));
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, active]);

  return (
    <div
      className="page-surface relative bg-white shadow-md"
      data-page={pageNumber}
      style={{ width, height, ['--scale-factor' as string]: scale, ['--total-scale-factor' as string]: scale }}
    >
      {active ? (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 block" style={{ zIndex: 1 }} />
          <div ref={textRef} className="textLayer" />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-300 text-sm select-none">{pageNumber}</div>
      )}
      <SvgLayer page={pageNumber} dims={dims} dragRect={dragRect} />
      <PinLayer page={pageNumber} />
      <ViewportLayer page={pageNumber} />
      <LaserLayer page={pageNumber} dims={dims} />
      <ReactionLayer page={pageNumber} />
      <CursorLayer page={pageNumber} />
    </div>
  );
}
