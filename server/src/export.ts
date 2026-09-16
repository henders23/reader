import { resolveAnchor, TAG_LABELS, type Annotation, type Comment, type Participant, type SessionMeta } from '@reader/shared';

export function exportMarkdown(opts: {
  session: SessionMeta;
  participants: Participant[];
  annotations: Annotation[];
  comments: Comment[];
  pages: string[];
}): string {
  const { session, participants, annotations, comments, pages } = opts;
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const byAnnotation = new Map<string, Comment[]>();
  for (const c of comments) {
    const list = byAnnotation.get(c.annotationId) ?? [];
    list.push(c);
    byAnnotation.set(c.annotationId, list);
  }
  const date = new Date(session.createdAt).toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`# ${session.title}`);
  out.push('');
  out.push(`Reading session · ${date} · ${participants.filter((p) => !p.removedAt).map((p) => p.name).join(', ')}`);
  out.push('');

  const shared = annotations.filter((a) => !a.private).sort((a, b) => a.page - b.page || positionOf(a, pages) - positionOf(b, pages) || a.createdAt - b.createdAt);
  let currentPage = 0;
  for (const a of shared) {
    if (a.page !== currentPage) {
      currentPage = a.page;
      out.push(`## Page ${a.page}`);
      out.push('');
    }
    const author = names.get(a.authorId) ?? 'Unknown';
    const tag = a.tag ? ` _[${TAG_LABELS[a.tag]}]_` : '';
    const quote = quoteOf(a, pages);
    if (quote) {
      out.push(`> ${quote.replace(/\n/g, ' ')}`);
      out.push('>');
      out.push(`> — highlighted by ${author}${tag}`);
    } else if (a.kind === 'area') {
      out.push(`**Area highlight** by ${author}${tag}`);
    } else {
      out.push(`**Pin** by ${author}${tag}`);
    }
    out.push('');
    const thread = byAnnotation.get(a.id) ?? [];
    for (const c of thread) {
      const indent = c.parentId ? '    ' : '';
      const resolved = c.resolvedAt ? ' ✓' : '';
      out.push(`${indent}- **${names.get(c.authorId) ?? 'Unknown'}**${resolved}: ${c.body.replace(/\n/g, `\n${indent}  `)}`);
    }
    if (thread.length) out.push('');
  }
  if (!shared.length) out.push('_No shared annotations._');
  return out.join('\n');
}

function positionOf(a: Annotation, pages: string[]): number {
  const text = pages[a.page - 1] ?? '';
  const anchor = resolveAnchor(text, a.selectors);
  if (anchor) return anchor.start / Math.max(1, text.length);
  const rect = a.selectors.find((s) => s.type === 'RectSelector');
  if (rect && rect.type === 'RectSelector' && rect.rects.length) return rect.rects[0].y;
  const pt = a.selectors.find((s) => s.type === 'PointSelector');
  if (pt && pt.type === 'PointSelector') return pt.y;
  return 0;
}

function quoteOf(a: Annotation, pages: string[]): string | null {
  if (a.kind !== 'highlight') return null;
  const text = pages[a.page - 1] ?? '';
  const anchor = resolveAnchor(text, a.selectors);
  if (anchor) return text.slice(anchor.start, anchor.end);
  const q = a.selectors.find((s) => s.type === 'TextQuoteSelector');
  return q && q.type === 'TextQuoteSelector' ? q.exact : null;
}
