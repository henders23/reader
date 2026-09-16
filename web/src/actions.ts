import type { Annotation, Comment, Rect, Tag } from '@reader/shared';
import { makeTextSelectors } from '@reader/shared';
import { newId } from './ids.ts';
import { socket } from './ws.ts';
import { useStore } from './store.ts';
import { pageTexts } from './viewer/pageText.ts';
import type { SelectionInfo } from './viewer/selection.ts';

function base(kind: Annotation['kind'], page: number, opts: { color?: string; tag?: Tag | null; private?: boolean }) {
  const st = useStore.getState();
  return {
    id: newId(),
    sessionId: st.sessionId!,
    authorId: st.me!.id,
    kind,
    page,
    color: opts.color ?? st.color,
    tag: opts.tag === undefined ? st.tag : opts.tag,
    private: opts.private ?? false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function commit(a: Annotation): Annotation {
  const st = useStore.getState();
  st.upsertAnnotation(a); // optimistic; the server echo replaces it
  socket.send({ t: 'annotation.create', annotation: { id: a.id, kind: a.kind, page: a.page, selectors: a.selectors, color: a.color, tag: a.tag, private: a.private } });
  return a;
}

export function createHighlight(sel: SelectionInfo, opts: { color?: string; tag?: Tag | null; private?: boolean } = {}): Annotation {
  const text = pageTexts.get(sel.page)?.text ?? '';
  const a: Annotation = {
    ...base('highlight', sel.page, opts),
    selectors: [...makeTextSelectors(text, sel.start, sel.end), { type: 'RectSelector', rects: sel.rects }],
  };
  return commit(a);
}

export function createArea(page: number, rect: Rect, opts: { color?: string; tag?: Tag | null; private?: boolean } = {}): Annotation {
  return commit({ ...base('area', page, opts), selectors: [{ type: 'RectSelector', rects: [rect] }] });
}

export function createPin(page: number, x: number, y: number, opts: { color?: string; tag?: Tag | null; private?: boolean } = {}): Annotation {
  return commit({ ...base('pin', page, opts), selectors: [{ type: 'PointSelector', x, y }] });
}

export function updateAnnotation(id: string, patch: Partial<Pick<Annotation, 'color' | 'tag' | 'private'>>): void {
  const st = useStore.getState();
  const cur = st.annotations[id];
  if (cur) st.upsertAnnotation({ ...cur, ...patch, updatedAt: Date.now() });
  socket.send({ t: 'annotation.update', id, patch });
}

export function deleteAnnotation(id: string): void {
  useStore.getState().removeAnnotation(id);
  socket.send({ t: 'annotation.delete', id });
}

export function addComment(annotationId: string, body: string, parentId: string | null = null): Comment {
  const st = useStore.getState();
  const c: Comment = { id: newId(), annotationId, parentId, authorId: st.me!.id, body, resolvedAt: null, createdAt: Date.now(), editedAt: null };
  st.upsertComment(c);
  socket.send({ t: 'comment.create', comment: { id: c.id, annotationId, parentId, body } });
  return c;
}

export function editComment(id: string, body: string): void {
  const st = useStore.getState();
  const cur = st.comments[id];
  if (cur) st.upsertComment({ ...cur, body, editedAt: Date.now() });
  socket.send({ t: 'comment.update', id, body });
}

export function resolveComment(id: string, resolved: boolean): void {
  const st = useStore.getState();
  const cur = st.comments[id];
  if (cur) st.upsertComment({ ...cur, resolvedAt: resolved ? Date.now() : null });
  socket.send({ t: 'comment.resolve', id, resolved });
}

export function deleteComment(id: string): void {
  useStore.getState().removeComment(id);
  socket.send({ t: 'comment.delete', id });
}

/** Position of an annotation on its page (0..1 from the top), for sorting and scrolling. */
export function annotationY(a: Annotation): number {
  for (const s of a.selectors) {
    if (s.type === 'RectSelector' && s.rects.length) return Math.min(...s.rects.map((r) => r.y));
    if (s.type === 'PointSelector') return s.y;
  }
  return 0;
}

export function annotationQuote(a: Annotation): string | null {
  const q = a.selectors.find((s) => s.type === 'TextQuoteSelector');
  return q && q.type === 'TextQuoteSelector' ? q.exact : null;
}
