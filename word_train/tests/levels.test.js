import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';

const upper = text => text.toLocaleUpperCase('tr-TR');
const lower = text => text.toLocaleLowerCase('tr-TR');
const letters = /^[A-ZÇĞİÖŞÜÂÎÛ]+$/u;

// Independent Turkish possessive-form check, including the irregular forms used here.
// Semantic naturalness is editorially reviewed; a format test cannot prove it.
function possessed(base) {
  const exceptions = {
    SU: 'SUYU', RENK: 'RENGİ', KAYIT: 'KAYDI', HACİM: 'HACMİ', SAAT: 'SAATİ',
  };
  if (exceptions[base]) return exceptions[base];
  const vowels = [...base].filter(c => 'AEIİOÖUÜ'.includes(c));
  const vowel = vowels.at(-1);
  assert.ok(vowel, `Kökte ünlü yok: ${base}`);
  const ending = 'AI'.includes(vowel) ? 'I' : 'Eİ'.includes(vowel) ? 'İ' : 'OU'.includes(vowel) ? 'U' : 'Ü';
  if ('AEIİOÖUÜ'.includes(base.at(-1))) return base + 'S' + ending;
  const unchanged = new Set(['ÇAP', 'FARK', 'PAKET', 'PARK', 'İŞARET', 'FİYAT', 'ETİKET', 'TİP']);
  if (unchanged.has(base)) return base + ending;
  const softened = { P: 'B', Ç: 'C', T: 'D', K: 'Ğ' };
  return base.slice(0, -1) + (softened[base.at(-1)] || base.at(-1)) + ending;
}

test('en az 12 bölüm; benzersiz, sıralı kimlikler ve kısa Türkçe başlıklar', () => {
  assert.ok(LEVELS.length >= 12);
  assert.equal(new Set(LEVELS.map(level => level.title)).size, LEVELS.length);
  LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    assert.equal(typeof level.title, 'string');
    assert.ok(level.title.trim().length > 0 && level.title.length <= 30);
    assert.equal(level.title, level.title.trim());
  });
});

test('ilk bölüm kullanıcının örneğini sözcük ve kökleriyle aynen korur', () => {
  assert.deepEqual(LEVELS[0].chain.map(link => link.word),
    ['KİTAP', 'KAPAĞI', 'TASARIMI', 'EKİBİ', 'TOPLANTISI', 'NOTLARI', 'DEFTERİ', 'SAYFASI', 'KENARI', 'ÇİZGİSİ']);
  assert.deepEqual(LEVELS[0].chain.map(link => link.base),
    ['KİTAP', 'KAPAK', 'TASARIM', 'EKİP', 'TOPLANTI', 'NOT', 'DEFTER', 'SAYFA', 'KENAR', 'ÇİZGİ']);
});

for (const level of LEVELS) {
  test(`${level.id}. ${level.title}: zincir, kökler, ipuçları ve seçenekler`, () => {
    assert.ok(level.chain.length >= 8 && level.chain.length <= 12);
    // Every delivered level also has 8–12 *answer* links, even if the starter is excluded.
    assert.ok(level.chain.length - 1 >= 8 && level.chain.length - 1 <= 12);
    assert.equal(new Set(level.chain.map(link => link.word)).size, level.chain.length);
    assert.equal(new Set(level.chain.map(link => link.base)).size, level.chain.length);
    assert.equal(level.chain[0].word, level.chain[0].base);

    level.chain.forEach((link, index) => {
      assert.match(link.word, letters);
      assert.match(link.base, letters);
      assert.equal(link.word, upper(link.word));
      assert.equal(link.base, upper(link.base));
      assert.equal(link.word.normalize('NFC'), link.word);
      assert.equal(link.base.normalize('NFC'), link.base);
      if (index === 0) return;

      const previous = level.chain[index - 1];
      const label = `${previous.base} → ${link.word}`;
      assert.equal(link.phrase, `${lower(previous.base)} ${lower(link.word)}`, label);
      assert.equal(link.phrase.split(' ').length, 2, label);
      assert.equal(link.phrase, lower(link.phrase), label);
      const expectedWord = link.base === 'NOT' ? 'NOTLARI' : possessed(link.base);
      assert.equal(link.word, expectedWord, `${label}: sözlük kökü ve iyelik eki`);

      assert.equal(typeof link.hint, 'string', label);
      assert.ok(link.hint.trim().length >= 12 && link.hint.length <= 100, label);
      const hintWords = upper(link.hint).match(/[A-ZÇĞİÖŞÜÂÎÛ]+/gu) || [];
      assert.ok(!hintWords.includes(link.word), `${label}: ipucu cevabı yazmamalı`);
      assert.ok(!hintWords.includes(link.base), `${label}: ipucu kökü yazmamalı`);

      assert.ok(Array.isArray(link.distractors), label);
      assert.equal(link.distractors.length, 7, label);
      assert.equal(new Set(link.distractors).size, 7, label);
      for (const distractor of link.distractors) {
        assert.match(distractor, letters, label);
        assert.equal(distractor, upper(distractor), label);
        assert.notEqual(distractor, link.word, label);
        assert.notEqual(distractor, link.base, label);
      }
    });
  });
}

test('ilk harf ipucu: 108 halkada sekiz seçenek aynı Türkçe harfle başlar, benzersizdir ve uzunlukları yakındır', () => {
  let count = 0;
  for (const { id, chain } of LEVELS) {
    for (const [index, link] of chain.entries()) {
      if (index === 0) continue;
      count++;
      const label = `${id}.${index}: ${link.phrase}`;
      const options = [link.word, ...link.distractors];
      assert.equal(link.distractors.length, 7, label);
      assert.equal(new Set(options).size, 8, `${label}: cevap ve çeldiriciler farklı olmalı`);
      for (const distractor of link.distractors) {
        // Exact NFC letters: never strip accents or fold I/İ, C/Ç, G/Ğ, O/Ö, S/Ş, U/Ü.
        assert.equal(distractor.normalize('NFC'), distractor, label);
        assert.equal([...distractor][0], [...link.word][0], `${label}: ${distractor} ilk harfi`);
        assert.notEqual(distractor, link.word, label);
        assert.ok(Math.abs([...distractor].length - [...link.word].length) <= 3,
          `${label}: ${distractor} uzunluğu cevaptan en fazla üç harf farklı olmalı`);
      }
    }
  }
  assert.equal(count, 108);
});

test('bilinen bitişik birleşikler zincire iki kelime gibi sokulmaz', () => {
  // This is a regression list, not a replacement for a Turkish dictionary.
  const closed = new Set(['ayakkabı', 'hanımeli', 'denizyıldızı', 'denizanası', 'gökyüzü', 'gökkuşağı', 'buzdolabı', 'bilgisayar']);
  for (const { chain } of LEVELS) {
    for (const link of chain) {
      assert.ok(!closed.has(lower(link.base)));
      if (link.phrase) assert.ok(!closed.has(link.phrase.replaceAll(' ', '')), link.phrase);
    }
  }
});
