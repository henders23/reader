import { create } from 'zustand';
import type { Annotation, Comment, ID, Participant, PresenceState, RosterEntry, SessionMeta, Tag, Tool } from '@reader/shared';
import { HIGHLIGHT_COLORS } from '@reader/shared';

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Filters {
  authorId: ID | null;
  tag: Tag | null;
  hideResolved: boolean;
}

export interface State {
  // identity
  sessionId: ID | null;
  token: string | null;
  hostKey: string | null;
  session: SessionMeta | null;
  me: Participant | null;
  roster: RosterEntry[];
  connection: Connection;
  fatal: string | null; // e.g. removed from session

  // persistent objects
  annotations: Record<ID, Annotation>;
  comments: Record<ID, Comment>;

  // presence (others only)
  presence: Record<ID, PresenceState>;
  spotlight: ID | null;
  following: ID | null;

  // ui
  tool: Tool;
  color: string;
  tag: Tag | null;
  selectedAnnotationId: ID | null;
  sidebarMode: 'position' | 'time';
  sidebarOpen: boolean;
  filters: Filters;
  showPrivate: boolean;
  scale: number;
  currentPage: number;
  /** Set by the sidebar to ask the viewer to scroll somewhere. */
  scrollTarget: { page: number; y: number; nonce: number } | null;
  toast: string | null;

  // actions
  setIdentity(p: { sessionId: ID; token: string; hostKey?: string | null }): void;
  applySnapshot(s: { session: SessionMeta; you: Participant; roster: RosterEntry[]; annotations: Annotation[]; comments: Comment[] }): void;
  setRoster(r: RosterEntry[]): void;
  setConnection(c: Connection): void;
  setPresence(id: ID, state: PresenceState): void;
  clearPresence(id: ID): void;
  setSpotlight(by: ID | null): void;
  setFollowing(id: ID | null): void;
  upsertAnnotation(a: Annotation): void;
  removeAnnotation(id: ID): void;
  upsertComment(c: Comment): void;
  removeComment(id: ID): void;
  setTool(t: Tool): void;
  setColor(c: string): void;
  setTag(t: Tag | null): void;
  select(id: ID | null): void;
  setSidebarMode(m: 'position' | 'time'): void;
  toggleSidebar(): void;
  setFilters(f: Partial<Filters>): void;
  setShowPrivate(v: boolean): void;
  setScale(s: number): void;
  setCurrentPage(p: number): void;
  scrollTo(page: number, y: number): void;
  setSession(patch: Partial<SessionMeta>): void;
  setFatal(msg: string | null): void;
  toastMsg(msg: string | null): void;
  reset(): void;
}

const initial = {
  sessionId: null,
  token: null,
  hostKey: null,
  session: null,
  me: null,
  roster: [],
  connection: 'idle' as Connection,
  fatal: null,
  annotations: {},
  comments: {},
  presence: {},
  spotlight: null,
  following: null,
  tool: 'pointer' as Tool,
  color: HIGHLIGHT_COLORS[0],
  tag: null,
  selectedAnnotationId: null,
  sidebarMode: 'position' as const,
  sidebarOpen: true,
  filters: { authorId: null, tag: null, hideResolved: false },
  showPrivate: true,
  scale: 1,
  currentPage: 1,
  scrollTarget: null,
  toast: null,
};

export const useStore = create<State>((set) => ({
  ...initial,
  setIdentity: ({ sessionId, token, hostKey }) => set({ sessionId, token, hostKey: hostKey ?? null }),
  applySnapshot: (s) =>
    set({
      session: s.session,
      me: s.you,
      roster: s.roster,
      annotations: Object.fromEntries(s.annotations.map((a) => [a.id, a])),
      comments: Object.fromEntries(s.comments.map((c) => [c.id, c])),
    }),
  setRoster: (roster) => set({ roster }),
  setConnection: (connection) => set({ connection }),
  setPresence: (id, state) => set((st) => ({ presence: { ...st.presence, [id]: { ...st.presence[id], ...state } } })),
  clearPresence: (id) =>
    set((st) => {
      const presence = { ...st.presence };
      delete presence[id];
      return { presence, following: st.following === id ? null : st.following };
    }),
  setSpotlight: (spotlight) =>
    set((st) => {
      if (spotlight && spotlight !== st.me?.id) return { spotlight, following: spotlight };
      // Spotlight turned off: stop following the spotlighter, keep any manual follow of someone else.
      return { spotlight, following: st.following === st.spotlight ? null : st.following };
    }),
  setFollowing: (following) => set({ following }),
  upsertAnnotation: (a) => set((st) => ({ annotations: { ...st.annotations, [a.id]: a } })),
  removeAnnotation: (id) =>
    set((st) => {
      const annotations = { ...st.annotations };
      delete annotations[id];
      const comments = Object.fromEntries(Object.entries(st.comments).filter(([, c]) => c.annotationId !== id));
      return { annotations, comments, selectedAnnotationId: st.selectedAnnotationId === id ? null : st.selectedAnnotationId };
    }),
  upsertComment: (c) => set((st) => ({ comments: { ...st.comments, [c.id]: c } })),
  removeComment: (id) =>
    set((st) => {
      const comments = { ...st.comments };
      delete comments[id];
      return { comments };
    }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setTag: (tag) => set({ tag }),
  select: (selectedAnnotationId) => set((st) => ({ selectedAnnotationId, sidebarOpen: selectedAnnotationId ? true : st.sidebarOpen })),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  toggleSidebar: () => set((st) => ({ sidebarOpen: !st.sidebarOpen })),
  setFilters: (f) => set((st) => ({ filters: { ...st.filters, ...f } })),
  setShowPrivate: (showPrivate) => set({ showPrivate }),
  setScale: (scale) => set({ scale: Math.min(4, Math.max(0.25, scale)) }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  scrollTo: (page, y) => set({ scrollTarget: { page, y, nonce: Math.random() } }),
  setSession: (patch) => set((st) => ({ session: st.session ? { ...st.session, ...patch } : st.session })),
  setFatal: (fatal) => set({ fatal }),
  toastMsg: (toast) => set({ toast }),
  reset: () => set({ ...initial }),
}));

export function participantName(st: State, id: ID): string {
  return st.roster.find((r) => r.id === id)?.name ?? 'Someone';
}
export function participantColor(st: State, id: ID): string {
  return st.roster.find((r) => r.id === id)?.color ?? '#71717a';
}
