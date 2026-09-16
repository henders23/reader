import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPageText } from './text.ts';
import { makeTextSelectors, resolveAnchor } from './anchor.ts';

test('buildPageText concatenates items and tracks starts', () => {
  const pt = buildPageText([
    { str: 'Hello ', hasEOL: false },
    { str: 'world', hasEOL: true },
    { str: 'Next line' },
  ]);
  assert.equal(pt.text, 'Hello world\nNext line');
  assert.deepEqual(pt.itemStarts, [0, 6, 12, 21]);
});

test('resolveAnchor uses position when quote still matches', () => {
  const text = 'We observe a 3.2x speedup over the baseline.';
  const sel = makeTextSelectors(text, 13, 25);
  const a = resolveAnchor(text, sel);
  assert.deepEqual(a, { start: 13, end: 25, via: 'position' });
});

test('resolveAnchor falls back to quote search when text shifted', () => {
  const text = 'We observe a 3.2x speedup over the baseline.';
  const sel = makeTextSelectors(text, 13, 25);
  const shifted = 'Abstract. ' + text;
  const a = resolveAnchor(shifted, sel);
  assert.deepEqual(a, { start: 23, end: 35, via: 'quote' });
  assert.equal(shifted.slice(a!.start, a!.end), '3.2x speedup');
});

test('resolveAnchor disambiguates repeated quotes by context', () => {
  const text = 'the cat sat. the dog sat. the cat ran.';
  const sel = makeTextSelectors(text, 26, 33); // second "the cat"
  const a = resolveAnchor('X ' + text, sel);
  assert.equal(a!.start, 28);
});

test('resolveAnchor tolerates whitespace changes', () => {
  const text = 'We observe a 3.2x\nspeedup over the baseline.';
  const sel = makeTextSelectors(text, 13, 25);
  const a = resolveAnchor('We observe a   3.2x speedup over the baseline.', sel);
  assert.equal(a!.via, 'fuzzy');
  assert.equal('We observe a   3.2x speedup over the baseline.'.slice(a!.start, a!.end), '3.2x speedup');
});

test('resolveAnchor returns null when the text is gone', () => {
  const sel = makeTextSelectors('hello world', 0, 5);
  assert.equal(resolveAnchor('completely different', sel), null);
});
