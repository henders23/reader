import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { exportMarkdown } from './export.ts';
import { makeTextSelectors } from '@reader/shared';

function seed() {
  const store = new Store(openDb(':memory:'));
  const page1 = 'We observe a 3.2x speedup over the baseline.';
  const session = store.createSession({
    id: 's1', title: 'Paper', passcode: 'a-b-c', hostKeyHash: 'h', hostId: 'alice', pdfPath: '/nonexistent.pdf',
    pageCount: 1, pageDims: [{ w: 612, h: 792 }], scanned: false, pages: [page1], ttlMs: 1000,
  });
  const alice = store.createParticipant({ id: 'alice', sessionId: 's1', name: 'Alice', token: 't-alice', hostId: 'alice' });
  const bob = store.createParticipant({ id: 'bob', sessionId: 's1', name: 'Bob', token: 't-bob', hostId: 'alice' });
  return { store, session, alice, bob, page1 };
}

test('participants get distinct colours and authenticate by token', () => {
  const { store, alice, bob } = seed();
  assert.notEqual(alice.color, bob.color);
  assert.equal(store.authenticate('t-bob')?.participant.id, 'bob');
  assert.equal(store.authenticate('nope'), null);
  assert.equal(alice.isHost, true);
  assert.equal(bob.isHost, false);
});

test('private annotations are only listed for their author', () => {
  const { store, page1 } = seed();
  store.createAnnotation({ id: 'a1', sessionId: 's1', authorId: 'alice', kind: 'highlight', page: 1, color: '#fde047', tag: 'claim', private: false, selectors: makeTextSelectors(page1, 13, 25) });
  store.createAnnotation({ id: 'a2', sessionId: 's1', authorId: 'bob', kind: 'pin', page: 1, color: '#fde047', tag: null, private: true, selectors: [{ type: 'PointSelector', x: 0.5, y: 0.5 }] });
  assert.deepEqual(store.listAnnotations('s1', 'alice').map((a) => a.id), ['a1']);
  assert.deepEqual(store.listAnnotations('s1', 'bob').map((a) => a.id), ['a1', 'a2']);
  store.createComment({ id: 'c1', annotationId: 'a2', parentId: null, authorId: 'bob', body: 'secret' });
  assert.equal(store.listComments('s1', 'alice').length, 0);
  assert.equal(store.listComments('s1', 'bob').length, 1);
});

test('export quotes the anchored text and omits private notes', () => {
  const { store, session, page1 } = seed();
  store.createAnnotation({ id: 'a1', sessionId: 's1', authorId: 'alice', kind: 'highlight', page: 1, color: '#fde047', tag: 'question', private: false, selectors: makeTextSelectors(page1, 13, 25) });
  store.createAnnotation({ id: 'a2', sessionId: 's1', authorId: 'bob', kind: 'pin', page: 1, color: '#fde047', tag: null, private: true, selectors: [{ type: 'PointSelector', x: 0.5, y: 0.5 }] });
  store.createComment({ id: 'c1', annotationId: 'a1', parentId: null, authorId: 'bob', body: 'Which table?' });
  store.createComment({ id: 'c2', annotationId: 'a1', parentId: 'c1', authorId: 'alice', body: 'Table 2' });
  const md = exportMarkdown({
    session: { ...session, passcode: undefined },
    participants: store.listParticipants('s1', 'alice'),
    annotations: store.listAllAnnotations('s1'),
    comments: store.listAllComments('s1'),
    pages: store.pageTexts('s1'),
  });
  assert.match(md, /> 3\.2x speedup/);
  assert.match(md, /highlighted by Alice _\[Question\]_/);
  assert.match(md, /- \*\*Bob\*\*: Which table\?/);
  assert.match(md, /    - \*\*Alice\*\*: Table 2/);
  assert.doesNotMatch(md, /Pin/);
});

test('expired sessions are found and deleted', () => {
  const { store } = seed();
  assert.deepEqual(store.expiredSessionIds(Date.now() + 5000), ['s1']);
  store.deleteSession('s1');
  assert.equal(store.getSession('s1'), null);
  assert.equal(store.authenticate('t-alice'), null);
});
