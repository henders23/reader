/**
 * Canonical page text.
 *
 * Both the server (for export and anchoring) and the client (for selection
 * offsets) must derive exactly the same string from pdf.js text content, so
 * the rule lives here and is deliberately simple: concatenate every item's
 * string; append a newline after items that end a line.
 */

export interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

export interface PageText {
  text: string;
  /** Canonical offset at which item i begins. Length = items.length + 1 (final = text.length). */
  itemStarts: number[];
}

export function buildPageText(items: TextItemLike[]): PageText {
  let text = '';
  const itemStarts: number[] = [];
  for (const item of items) {
    itemStarts.push(text.length);
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  itemStarts.push(text.length);
  return { text, itemStarts };
}

/** Normalise whitespace for comparison: collapse runs, trim. */
export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
