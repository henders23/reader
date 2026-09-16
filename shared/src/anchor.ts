import type { Selector, TextPositionSelector, TextQuoteSelector } from './types.ts';

export interface Anchor {
  start: number;
  end: number;
  /** How the anchor was found; 'position' is exact, others indicate the text drifted. */
  via: 'position' | 'quote' | 'fuzzy';
}

const CONTEXT = 32;

export function makeTextSelectors(pageText: string, start: number, end: number): [TextQuoteSelector, TextPositionSelector] {
  return [
    {
      type: 'TextQuoteSelector',
      exact: pageText.slice(start, end),
      prefix: pageText.slice(Math.max(0, start - CONTEXT), start),
      suffix: pageText.slice(end, end + CONTEXT),
    },
    { type: 'TextPositionSelector', start, end },
  ];
}

/**
 * Re-anchor a highlight against the canonical page text.
 * Chain: position (verified against the quote) -> exact quote search
 * (disambiguated by prefix/suffix) -> whitespace-insensitive search -> null.
 */
export function resolveAnchor(pageText: string, selectors: Selector[]): Anchor | null {
  const pos = selectors.find((s): s is TextPositionSelector => s.type === 'TextPositionSelector');
  const quote = selectors.find((s): s is TextQuoteSelector => s.type === 'TextQuoteSelector');

  if (pos && pos.start >= 0 && pos.end <= pageText.length && pos.start < pos.end) {
    if (!quote || pageText.slice(pos.start, pos.end) === quote.exact) {
      return { start: pos.start, end: pos.end, via: 'position' };
    }
  }
  if (!quote || !quote.exact) return null;

  // Exact search, pick the candidate whose context matches best, nearest to the old position.
  const candidates: number[] = [];
  let i = pageText.indexOf(quote.exact);
  while (i !== -1 && candidates.length < 50) {
    candidates.push(i);
    i = pageText.indexOf(quote.exact, i + 1);
  }
  if (candidates.length) {
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      let score = 0;
      if (quote.prefix && pageText.slice(Math.max(0, c - quote.prefix.length), c) === quote.prefix) score += 2;
      if (quote.suffix && pageText.slice(c + quote.exact.length, c + quote.exact.length + quote.suffix.length) === quote.suffix) score += 2;
      if (pos) score -= Math.abs(c - pos.start) / Math.max(1, pageText.length);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return { start: best, end: best + quote.exact.length, via: 'quote' };
  }

  // Whitespace-insensitive: map squashed offsets back to original offsets.
  const map: number[] = [];
  let squashed = '';
  let lastSpace = true;
  for (let k = 0; k < pageText.length; k++) {
    const ch = pageText[k];
    if (/\s/.test(ch)) {
      if (!lastSpace) {
        squashed += ' ';
        map.push(k);
      }
      lastSpace = true;
    } else {
      squashed += ch;
      map.push(k);
      lastSpace = false;
    }
  }
  const target = quote.exact.replace(/\s+/g, ' ').trim();
  if (!target) return null;
  const j = squashed.indexOf(target);
  if (j === -1) return null;
  return { start: map[j], end: map[j + target.length - 1] + 1, via: 'fuzzy' };
}
