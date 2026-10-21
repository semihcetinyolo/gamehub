import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_LEVEL } from './fixtures/sample-level.js';
import { levelEndSummary } from '../core/levelend.js';
import { createRun, answer } from '../core/logic.js';

function finished(level, { wrong = 0 } = {}) {
  let state = createRun(level);
  for (let i = 0; i < wrong; i++) state = answer(state, 'YANLIŞ').state;
  for (const link of level.chain.slice(1)) state = answer(state, link.word).state;
  return state;
}

test('level-end summary: links, last phrase, last three, stats from the run', () => {
  const state = finished(SAMPLE_LEVEL, { wrong: 2 });
  const out = levelEndSummary({ level: SAMPLE_LEVEL, found: state.found, mistakes: state.mistakes, hints: 1 });
  const phrases = SAMPLE_LEVEL.chain.slice(1).map(link => link.phrase);
  assert.equal(out.title, 'Bölüm tamamlandı!');
  assert.equal(out.phrase, phrases.at(-1));
  assert.deepEqual(out.receipt, phrases.slice(-3));
  assert.deepEqual(out.stats.map(s => s.value), [SAMPLE_LEVEL.chain.length - 1, 2, 1]);
  assert.deepEqual(out.stats.map(s => s.label), ['bağlantı', 'hata', 'yardım']);
  assert.deepEqual(out.sign, { small: 'BÖLÜM 1', name: 'Ofis' });
  assert.deepEqual(out.actions.map(a => a.id), ['next', 'replay', 'levels']);
  assert.equal(out.note, '');
  assert.equal(out.announce, `Bölüm tamamlandı, ${SAMPLE_LEVEL.chain.length - 1} bağlantı, 2 hata, 1 yardım.`);
});

test('level-end summary: the final level has no "next", picks a level instead', () => {
  const out = levelEndSummary({ level: SAMPLE_LEVEL, found: finished(SAMPLE_LEVEL).found, last: true, number: 12 });
  assert.equal(out.title, 'Bütün duraklar tamam!');
  assert.equal(out.sign.small, 'SON DURAK');
  assert.deepEqual(out.actions.map(a => [a.id, a.label]), [['levels', 'Bölüm seç'], ['replay', 'Tekrar oyna']]);
  assert.ok(out.note.startsWith('Tüm bölümler tamamlandı.'));
});

test('level-end summary: short runs, missing phrases and Turkish casing', () => {
  const level = { id: 7, title: 'İğne', chain: [{ word: 'İĞNE', base: 'İĞNE' }, { word: 'İPLİĞİ', base: 'İPLİK' }] };
  const out = levelEndSummary({ level, found: ['İĞNE', 'İPLİĞİ'], number: 7 });
  assert.equal(out.phrase, 'iğne ipliği');
  assert.deepEqual(out.receipt, ['iğne ipliği']);
  assert.equal(out.sign.small, 'BÖLÜM 7');
  assert.equal(levelEndSummary({ level, found: ['İĞNE'] }).receipt.length, 0);
});
