import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';

const upper = text => text.toLocaleUpperCase('tr-TR');
const lower = text => text.toLocaleLowerCase('tr-TR');
const letters = /^[A-ZÇĞİÖŞÜÂÎÛ]+$/u;
const answerCounts = [5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9];

// Independent Turkish possessive-form check, including the irregular forms used here.
// Semantic naturalness is editorially reviewed; a format test cannot prove it.
function possessed(base) {
  const exceptions = {
    SU: 'SUYU', RENK: 'RENGİ', KAYIT: 'KAYDI', HACİM: 'HACMİ', SAAT: 'SAATİ',
    ÖMÜR: 'ÖMRÜ', RESİM: 'RESMİ', ZAM: 'ZAMMI',
  };
  if (exceptions[base]) return exceptions[base];
  const vowels = [...base].filter(c => 'AEIİOÖUÜ'.includes(c));
  const vowel = vowels.at(-1);
  assert.ok(vowel, `Kökte ünlü yok: ${base}`);
  const ending = 'AI'.includes(vowel) ? 'I' : 'Eİ'.includes(vowel) ? 'İ' : 'OU'.includes(vowel) ? 'U' : 'Ü';
  if ('AEIİOÖUÜ'.includes(base.at(-1))) return base + 'S' + ending;
  const unchanged = new Set(['ÇAP', 'FARK', 'PAKET', 'PARK', 'İŞARET', 'FİYAT', 'ETİKET', 'TİP', 'BİLET', 'MAÇ', 'TÜP', 'SAP']);
  if (unchanged.has(base)) return base + ending;
  const softened = { P: 'B', Ç: 'C', T: 'D', K: 'Ğ' };
  return base.slice(0, -1) + (softened[base.at(-1)] || base.at(-1)) + ending;
}

test('12 bölüm; 5,6,7,8,9 cevaplık ilerleme, sıralı kimlikler ve kısa Türkçe başlıklar', () => {
  assert.equal(LEVELS.length, 12);
  assert.deepEqual(LEVELS.map(level => level.chain.length - 1), answerCounts);
  assert.equal(new Set(LEVELS.map(level => level.title)).size, LEVELS.length);
  LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    assert.equal(typeof level.title, 'string');
    assert.ok(level.title.trim().length > 0 && level.title.length <= 30);
    assert.equal(level.title, level.title.trim());
  });
});

test('ilk bölüm kullanıcının örneğinin ilk beş cevabını sözcük ve kökleriyle korur', () => {
  assert.deepEqual(LEVELS[0].chain.map(link => link.word),
    ['KİTAP', 'KAPAĞI', 'TASARIMI', 'EKİBİ', 'TOPLANTISI', 'NOTLARI']);
  assert.deepEqual(LEVELS[0].chain.map(link => link.base),
    ['KİTAP', 'KAPAK', 'TASARIM', 'EKİP', 'TOPLANTI', 'NOT']);
});

for (const level of LEVELS) {
  test(`${level.id}. ${level.title}: zincir, kökler, ipuçları ve seçenekler`, () => {
    assert.equal(level.chain.length, answerCounts[level.id - 1] + 1);
    assert.ok(level.chain.length - 1 <= 9);
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

test('ilk harf ipucu: 98 halkada sekiz seçenek aynı Türkçe harfle başlar, benzersizdir ve uzunlukları yakındır', () => {
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
  assert.equal(count, 98);
});

test('98 tamlamanın her biri bütün oyunda yalnız bir kez kullanılır', () => {
  const seen = new Map();
  for (const { id, chain } of LEVELS) {
    for (const [index, link] of chain.entries()) {
      if (index === 0) continue;
      assert.ok(!seen.has(link.phrase),
        `${link.phrase}: ${seen.get(link.phrase)} ve ${id}.${index} tekrar ediyor`);
      seen.set(link.phrase, `${id}.${index}`);
    }
  }
  assert.equal(seen.size, 98);
});

test('cevap kökü en fazla iki bölümde görünür; iki yöndeki komşuları tekrar etmez', () => {
  const answerLevels = new Map();
  const neighbours = new Map();
  for (const { id, chain } of LEVELS) {
    chain.forEach((link, index) => {
      if (index > 0) {
        const appearances = answerLevels.get(link.base) ?? new Set();
        appearances.add(id);
        answerLevels.set(link.base, appearances);
        assert.ok(appearances.size <= 2,
          `${link.base}: ${[...appearances].join(', ')} bölümlerinde cevap olarak tekrar ediyor`);
      }
      // Also include starters here: reversing a phrase or moving it to the start
      // must not bypass the no-shared-neighbour rule.
      const used = neighbours.get(link.base) ?? new Map();
      for (const neighbour of [chain[index - 1], chain[index + 1]].filter(Boolean)) {
        assert.ok(!used.has(neighbour.base),
          `${link.base} / ${neighbour.base}: ${used.get(neighbour.base)} ve ${id} komşuluğu tekrar ediyor`);
        used.set(neighbour.base, id);
      }
      neighbours.set(link.base, used);
    });
  }
});

test('editoryal olarak elenen seyrek bağlantılar ve çeldiriciler geri gelmez', () => {
  // A small regression list, not a claim that tests can measure Turkish usage frequency.
  const weakPhrases = new Set(['damla sesi', 'halka çapı', 'çap ölçüsü', 'alan derinliği',
    'derinlik algısı', 'hacim hesabı', 'sunucu ekibi', 'tip seçimi']);
  const rareOptions = new Set(['UZAMI', 'LÜGATİ', 'NOKSANLIĞI', 'RÖLYEFİ', 'KİPİ',
    'ŞAİBESİ', 'LEVYESİ', 'LOKASYONU', 'NÜKTELERİ', 'NUTUKLARI']);
  for (const { chain } of LEVELS) {
    for (const link of chain.slice(1)) {
      assert.ok(!weakPhrases.has(link.phrase), link.phrase);
      for (const option of [link.word, ...link.distractors]) {
        assert.ok(!rareOptions.has(option), `${link.phrase}: ${option}`);
      }
    }
  }
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
