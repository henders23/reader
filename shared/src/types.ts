// Shared domain types used by both server and web.

export type ID = string;

/** Rectangle in normalised page space: all values in [0, 1] relative to page width/height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageDims {
  w: number; // PDF points
  h: number;
}

export interface SessionMeta {
  id: ID;
  title: string;
  pageCount: number;
  pageDims: PageDims[];
  scanned: boolean;
  hostId: ID;
  createdAt: number;
  expiresAt: number;
  endedAt: number | null;
  /** Only present for the host. */
  passcode?: string;
}

export interface Participant {
  id: ID;
  sessionId: ID;
  name: string;
  color: string;
  isHost: boolean;
  createdAt: number;
  lastSeenAt: number;
  removedAt: number | null;
}

export type AnnotationKind = 'highlight' | 'area' | 'pin';

export const TAGS = ['claim', 'question', 'confusion', 'disagree', 'method', 'definition'] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABELS: Record<Tag, string> = {
  claim: 'Key claim',
  question: 'Question',
  confusion: 'Confusion',
  disagree: 'Disagree',
  method: 'Method',
  definition: 'Definition',
};

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix: string;
  suffix: string;
}
export interface TextPositionSelector {
  type: 'TextPositionSelector';
  /** Character offsets into the canonical page text (see text.ts). */
  start: number;
  end: number;
}
export interface RectSelector {
  type: 'RectSelector';
  rects: Rect[];
}
export interface PointSelector {
  type: 'PointSelector';
  x: number;
  y: number;
}
export type Selector = TextQuoteSelector | TextPositionSelector | RectSelector | PointSelector;

export interface Annotation {
  id: ID;
  sessionId: ID;
  authorId: ID;
  kind: AnnotationKind;
  page: number; // 1-based
  selectors: Selector[];
  color: string;
  tag: Tag | null;
  private: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Comment {
  id: ID;
  annotationId: ID;
  parentId: ID | null;
  authorId: ID;
  body: string;
  resolvedAt: number | null;
  createdAt: number;
  editedAt: number | null;
}

export type Tool = 'pointer' | 'highlight' | 'area' | 'pin' | 'laser';

export interface Viewport {
  /** First visible page and the fraction of it (0..1) at the top of the window. */
  page: number;
  top: number;
  /** Last visible page and the fraction of it at the bottom of the window. */
  pageEnd: number;
  bottom: number;
}

export interface PresenceState {
  cursor?: { page: number; x: number; y: number } | null;
  viewport?: Viewport | null;
  selection?: { page: number; rects: Rect[] } | null;
  tool?: Tool;
  following?: ID | null;
  handRaised?: boolean;
  /** Set by the server when relaying. */
  at?: number;
}

export interface RosterEntry {
  id: ID;
  name: string;
  color: string;
  isHost: boolean;
  online: boolean;
}

export interface SessionSnapshot {
  session: SessionMeta;
  you: Participant;
  roster: RosterEntry[];
  annotations: Annotation[];
  comments: Comment[];
}

// ---------- WebSocket protocol ----------

export type ClientMsg =
  | { t: 'presence'; state: PresenceState }
  | { t: 'laser'; page: number; points: [number, number][]; id: string; done?: boolean }
  | { t: 'react'; emoji: string; page: number; x: number; y: number }
  | { t: 'spotlight'; on: boolean }
  | {
      t: 'annotation.create';
      annotation: Pick<Annotation, 'id' | 'kind' | 'page' | 'selectors' | 'color' | 'tag' | 'private'>;
    }
  | { t: 'annotation.update'; id: ID; patch: Partial<Pick<Annotation, 'color' | 'tag' | 'private'>> }
  | { t: 'annotation.delete'; id: ID }
  | { t: 'comment.create'; comment: Pick<Comment, 'id' | 'annotationId' | 'parentId' | 'body'> }
  | { t: 'comment.update'; id: ID; body: string }
  | { t: 'comment.delete'; id: ID }
  | { t: 'comment.resolve'; id: ID; resolved: boolean }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; roster: RosterEntry[]; presence: Record<ID, PresenceState>; spotlight: ID | null }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'presence'; from: ID; state: PresenceState }
  | { t: 'laser'; from: ID; page: number; points: [number, number][]; id: string; done?: boolean }
  | { t: 'react'; from: ID; emoji: string; page: number; x: number; y: number }
  | { t: 'spotlight'; by: ID | null }
  | { t: 'annotation'; op: 'create' | 'update' | 'delete'; row: Annotation }
  | { t: 'comment'; op: 'create' | 'update' | 'delete'; row: Comment }
  | { t: 'session'; op: 'ended' | 'passcodeChanged' | 'removed' | 'expiring'; expiresAt?: number }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const PARTICIPANT_COLORS = [
  '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0d9488',
  '#0284c7', '#4f46e5', '#9333ea', '#c026d3', '#db2777',
  '#65a30d', '#0891b2',
];

export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd'];
