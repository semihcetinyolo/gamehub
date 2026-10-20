import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS as TURKISH_LEVELS } from '../levels-tr.js';
import { LEVELS as ENGLISH_LEVELS, LEVEL_SETS } from '../levels.js';
import { validateLevel, createGame, findSolutions, submit, wordOf } from '../logic.js';

test('both language sets meet the authored part-length and level-size rules', () => {
  for (const [language, levels] of Object.entries(LEVEL_SETS)) {
    assert.ok(levels.length >= 12, `${language}: retain the original twelve levels and append expansions`);
    assert.equal(new Set(levels.map(level => level.root)).size, levels.length);
    for (const level of levels) {
      assert.ok(level.words.length >= 8 && level.words.length <= 12);
      let singleLetters = 0;
      for (const { word, parts, open } of level.words) {
        const label = `${language} ${word}`;
        assert.ok(parts.length >= 2 && parts.length <= 3, `${label}: expected 2–3 parts`);
        assert.ok(parts.every(part => /^[A-ZÇĞİÖŞÜ]{1,3}$/.test(part)), `${label}: letter chunks only`);
        const singles = parts.filter(part => part.length === 1).length;
        assert.ok(singles <= 1, `${label}: never two single-letter parts in a word`);
        singleLetters += singles;
        const suffixLength = word.length - level.root.length;
        assert.ok(suffixLength >= 4 && suffixLength <= 9, `${label}: suffix must contain 4–9 letters`);
        assert.equal(level.root + parts.join(''), word);
        if (language === 'tr') {
          assert.ok(parts.every(part => part.length === 1 || /[AEIİOÖUÜ]/.test(part)),
            `${label}: multi-letter Turkish chunks need a vowel, not a bare consonant cluster`);
          assert.ok(!word.includes(' '), `${label}: dictionary spaces belong in open, not word`);
          assert.ok(open === undefined || typeof open === 'boolean',
            `${label}: open is optional boolean metadata`);
        }
      }
      assert.ok(singleLetters <= 1, `${language} ${level.root}: at most one single-letter part per level`);
    }
  }
});

test('Turkish branches use meaningful roots and include spaced dictionary compounds', () => {
  const roots = new Set(['SU', 'KAR', 'GÖZ', 'EL', 'DENİZ', 'GÖK', 'YER', 'KARA', 'BAŞ', 'KUŞ', 'AĞAÇ', 'TAŞ']);
  assert.deepEqual(new Set(TURKISH_LEVELS.slice(0, 12).map(level => level.root)), roots);
  const expansionRoots = new Set(['DEMİR', 'YOL', 'SES', 'DİL', 'ATEŞ', 'AY', 'GÜN']);
  for (const level of TURKISH_LEVELS.slice(12)) assert.ok(expansionRoots.has(level.root));
  assert.ok(TURKISH_LEVELS.some(level => level.words.some(entry => entry.open === true)));
  // These former targets only share letters with their supposed root.
  const unrelated = new Set(['ELBİSE', 'ELASTİK', 'ELEMAN', 'ELVEDA', 'KARANFİL', 'KARBONAT', 'KARAKTER']);
  for (const level of TURKISH_LEVELS) {
    for (const entry of level.words) assert.ok(!unrelated.has(entry.word), `${entry.word}: no coincidence branches`);
    // Closed/open spellings must not create duplicate answers (e.g. KARTOPU / KAR TOPU).
    assert.equal(new Set(level.words.map(entry => entry.word)).size, level.words.length);
  }
});

test('the four original SNOW examples keep their exact words and splits', () => {
  assert.ok(!ENGLISH_LEVELS[0].words.some(entry => entry.word === 'SNOWBLOW'),
    'SNOWBLOW is not a common target or a prefix trap');
  assert.deepEqual(ENGLISH_LEVELS[0].words.slice(0, 4), [
    { word: 'SNOWBALL', parts: ['BA', 'LL'] },
    { word: 'SNOWFLAKE', parts: ['FL', 'AKE'] },
    { word: 'SNOWBLOWER', parts: ['BL', 'OW', 'ER'] },
    { word: 'SNOWFALL', parts: ['FA', 'LL'] },
  ]);
});

test('Turkish levels do not pair a -MA/-ME form with its -MAK/-MEK infinitive', () => {
  for (const level of TURKISH_LEVELS) {
    const words = new Set(level.words.map(entry => entry.word));
    for (const word of words) {
      if (word.endsWith('MA') || word.endsWith('ME')) {
        assert.ok(!words.has(`${word}K`), `${word} and ${word}K must not share a level`);
      }
    }
  }
});

test('language sets expose the English and expanded Turkish sets', () => {
  assert.equal(LEVEL_SETS.en, ENGLISH_LEVELS);
  assert.equal(LEVEL_SETS.tr, TURKISH_LEVELS);
  assert.ok(TURKISH_LEVELS.length >= 12);
  assert.equal(new Set(TURKISH_LEVELS.map(level => level.root)).size, TURKISH_LEVELS.length);
  for (const [index, level] of TURKISH_LEVELS.entries()) {
    assert.equal(level.id, index + 1);
    assert.equal(level.root, level.root.toLocaleUpperCase('tr'));
    assert.ok(level.words.length >= 8 && level.words.length <= 12);
    validateLevel(level);
    for (const wheelSlots of [5, 6, 7, 8]) validateLevel(level, { wheelSlots });
    for (const { word, parts } of level.words) {
      assert.equal(word, word.toLocaleUpperCase('tr'));
      assert.equal(word, word.normalize('NFC'));
      assert.equal(level.root + parts.join(''), word);
      assert.ok(parts.length >= 2 && parts.length <= 3);
      assert.ok(parts.every(part => /^[A-ZÇĞİÖŞÜ]{1,3}$/.test(part)));
    }
  }
  const allWords = TURKISH_LEVELS.flatMap(level => level.words.map(entry => entry.word)).join('');
  for (const letter of 'ÇĞİÖŞÜI') assert.ok(allWords.includes(letter), `Coverage for ${letter}`);
});

for (const level of TURKISH_LEVELS) {
  test(`Turkish ${level.id} ${level.root}: complete games across all admin row/slot settings`, () => {
    const minimumSlots = Math.max(...level.words.map(entry => entry.parts.length));
    for (let visibleRows = 1; visibleRows <= 6; visibleRows++) {
      for (let wheelSlots = minimumSlots; wheelSlots <= 8; wheelSlots++) {
        for (let seed = 0; seed < 50; seed++) {
          let state = createGame(level, { visibleRows, wheelSlots, seed });
          let steps = 0;
          const seenNodes = new Set(state.wheel.filter(Boolean).map(node => node.id));
          const seenRows = new Set(state.rows.map(row => row.id));
          while (!state.done) {
            assert.equal(state.wheel.length, wheelSlots);
            assert.ok(state.rows.length <= visibleRows);
            for (const row of state.rows) {
              const authored = level.words.find(entry => entry.word === row.word);
              assert.equal(row.open, authored.open === true, `${row.word}: preserve its dictionary word gap`);
            }
            assert.equal(state.found.length + state.rows.length + state.queue.length, level.words.length);
            const choices = findSolutions(state);
            assert.ok(choices.length, `${level.root}: seed ${seed}, rows ${visibleRows}, slots ${wheelSlots}`);
            const choice = choices[(seed + steps * 7) % choices.length];
            const target = state.rows.find(row => row.id === choice.rowId);
            assert.equal(wordOf(state, choice.nodeIds), target.word);
            assert.equal(new Set(choice.nodeIds).size, choice.nodeIds.length);
            const previous = JSON.stringify(state);
            const { state: next, result } = submit(state, choice.nodeIds);
            assert.equal(JSON.stringify(state), previous, 'submission does not mutate input');
            assert.ok(result.ok);
            for (const id of result.addedNodeIds) {
              assert.ok(!seenNodes.has(id), 'node ids never reused');
              seenNodes.add(id);
            }
            if (result.addedRowId) {
              assert.ok(!seenRows.has(result.addedRowId), 'row ids never reused');
              seenRows.add(result.addedRowId);
            }
            assert.ok(++steps <= level.words.length);
            state = next;
          }
          assert.equal(steps, level.words.length);
          assert.deepEqual([...state.found].sort(), level.words.map(entry => entry.word).sort());
          assert.deepEqual(state.rows, []);
          assert.deepEqual(state.queue, []);
        }
      }
    }
  });
}

// Lexical audit: TDK Güncel Türkçe Sözlük (sozluk.gov.tr/gts?ara=...), 2026-10-20.
// Recognisable prefix traps, including user feedback; this is not a list of approved targets.
// Target/headword audit runs separately in /tmp/wb-tdk/verify.mjs. Pending entries are
// marked in levels-tr.js; timeout/HTTP errors never count as dictionary rejections.
// This fixture stays offline so network availability cannot change a test result.
const knownPrefixWords = {
  tr: new Set(`
ELÇİ ELVERİŞ ELBET KARİ ALDI ALÜMİN
ATMA ATIL ATAR ATA KARIN KARMA KARA AYAK AYDIN AYRI AYRICA AYAR
BAŞKAN BAŞLI GÜNDE GÜNCEL GÜNEŞ GÜNEY SUNU SUSUZ SUSAM
ALFA ALIŞ ALIŞKAN ALA ALMA İŞVE İŞÇİ İŞLEV İŞLEM
ASAN ASLAN ASKI ASİ AKAR AKIN AKIL AKOR AKSE AKSİ
ANA ANLAM ANIT ANTİKA ANTRE GÜLDÜRÜ İŞPORTA
ALERJİ ARMONİ ASORTİ ONKOLOJİ ONTOLOJİ
GÖZLÜK GÖZCÜ DEMİRCİ YEREL ELEME GÖKBİLİM
  `.trim().split(/\s+/)),
  // Recognisable words only: obscure HANDWRIT/FIRECRACK and SNOWBLOW do not count.
  en: new Set(['FIREFIGHT', 'FIRELIGHT', 'WATERLOG']),
};

test('known dictionary prefixes must also be targets in the same level', () => {
  for (const [language, levels] of Object.entries(LEVEL_SETS)) {
    for (const level of levels) {
      const targets = new Set(level.words.map(entry => entry.word));
      for (const { word, parts } of level.words) {
        for (let k = 1; k < parts.length; k++) {
          const prefix = level.root + parts.slice(0, k).join('');
          assert.ok(!knownPrefixWords[language].has(prefix) || targets.has(prefix),
            `${language} ${word}: dictionary prefix ${prefix} needs its own target`);
        }
      }
    }
  }
});

test('Turkish targets exclude verbal nouns in -MA/-ME and infinitives', () => {
  // PARMAK is a noun (finger), not an infinitive; compounds retain that ending.
  const lexicalNouns = new Set(['BAŞPARMAK']);
  for (const level of TURKISH_LEVELS) {
    for (const { word } of level.words) {
      assert.ok(!/(?:MA|ME|MAK|MEK)$/.test(word) || lexicalNouns.has(word),
        `${word}: verbal nouns and infinitives are not level targets`);
    }
  }
});
