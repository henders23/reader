import type { Rect } from '@reader/shared';
import { pageTexts } from './pageText.ts';

export interface SelectionInfo {
  page: number;
  start: number;
  end: number;
  text: string;
  rects: Rect[];
  /** Bounding box of the last rect, in viewport CSS px, for positioning a popover. */
  anchorRect: DOMRect;
}

function pageOf(node: Node | null): { page: number; el: HTMLElement; layer: HTMLElement } | null {
  const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
  const layer = el?.closest('.textLayer') as HTMLElement | null;
  const pageEl = layer?.closest('[data-page]') as HTMLElement | null;
  if (!layer || !pageEl) return null;
  return { page: Number(pageEl.dataset.page), el: pageEl, layer };
}

/** Canonical offset of a DOM boundary inside a text layer. */
function offsetOf(layer: HTMLElement, page: number, node: Node, offset: number): number | null {
  const pt = pageTexts.get(page);
  if (!pt) return null;
  let span: HTMLElement | null = null;
  let inner = 0;
  if (node.nodeType === Node.TEXT_NODE) {
    span = node.parentElement;
    inner = offset;
  } else if (node === layer) {
    // Boundary between children: take the start of the child at `offset` (or end of the last).
    const child = layer.children[offset] as HTMLElement | undefined;
    if (child) {
      span = child;
      inner = 0;
    } else {
      return pt.text.length;
    }
  } else {
    span = node as HTMLElement;
    inner = offset > 0 ? (span.textContent?.length ?? 0) : 0;
  }
  // <br> elements (line ends) are not text items; snap to the end of the previous span.
  while (span && span.dataset.i === undefined) {
    const prev = span.previousElementSibling as HTMLElement | null;
    if (!prev) return 0;
    span = prev;
    inner = span.textContent?.length ?? 0;
  }
  if (!span) return null;
  const i = Number(span.dataset.i);
  const startOfItem = pt.itemStarts[i];
  if (startOfItem === undefined) return null;
  const itemLen = pt.itemStarts[i + 1] - startOfItem;
  return startOfItem + Math.min(inner, itemLen);
}

export function normaliseRects(clientRects: Iterable<DOMRect>, pageEl: HTMLElement): Rect[] {
  const pr = pageEl.getBoundingClientRect();
  const out: Rect[] = [];
  for (const r of clientRects) {
    if (r.width < 1 || r.height < 1) continue;
    const rect: Rect = {
      x: (r.left - pr.left) / pr.width,
      y: (r.top - pr.top) / pr.height,
      w: r.width / pr.width,
      h: r.height / pr.height,
    };
    if (rect.x < -0.01 || rect.y < -0.01 || rect.x + rect.w > 1.01 || rect.y + rect.h > 1.01) continue;
    out.push(rect);
  }
  return mergeLineRects(out);
}

/** Merge rects that sit on the same line into one; keeps the highlight tidy. */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - r.y) < last.h * 0.5 && r.x <= last.x + last.w + 0.01) {
      const x = Math.min(last.x, r.x);
      const right = Math.max(last.x + last.w, r.x + r.w);
      const y = Math.min(last.y, r.y);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      out[out.length - 1] = { x, y, w: right - x, h: bottom - y };
    } else out.push({ ...r });
  }
  return out;
}

export function getSelectionInfo(): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const startPage = pageOf(range.startContainer);
  if (!startPage) return null;
  const endPage = pageOf(range.endContainer);

  const work = range.cloneRange();
  if (!endPage || endPage.page !== startPage.page) {
    // Selection crossed a page boundary: keep the part on the first page.
    work.setEnd(startPage.layer, startPage.layer.childNodes.length);
  }
  const start = offsetOf(startPage.layer, startPage.page, work.startContainer, work.startOffset);
  const end = offsetOf(startPage.layer, startPage.page, work.endContainer, work.endOffset);
  if (start === null || end === null || end <= start) return null;
  const pt = pageTexts.get(startPage.page)!;
  const rects = normaliseRects(work.getClientRects(), startPage.el);
  if (!rects.length) return null;
  const clientRects = Array.from(work.getClientRects()).filter((r) => r.width >= 1);
  return {
    page: startPage.page,
    start,
    end,
    text: pt.text.slice(start, end),
    rects,
    anchorRect: clientRects[clientRects.length - 1] ?? work.getBoundingClientRect(),
  };
}

// Debug hook: inspect selection mapping from the browser console.
(window as unknown as { __reader?: unknown }).__reader = { getSelectionInfo, pageTexts };
