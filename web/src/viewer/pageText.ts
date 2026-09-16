import type { PageText } from '@reader/shared';

/** Canonical text per page for the currently open document, filled in as text layers render. */
export const pageTexts = new Map<number, PageText>();
