import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LEVELS } from '../levels.js';
import { DEFAULTS, validateLevel, createGame, findSolutions, submit } from '../logic.js';

const roots = ['BLACK', 'BLUE', 'GREEN', 'WHITE', 'WIND', 'NIGHT', 'DAY',
  'PLAY', 'FRUIT', 'COFFEE', 'TEA', 'FLOWER', 'BIRTH', 'HEAT'];
const expansion = LEVELS.slice(12);

test('English expansion preserves the original twelve levels exactly and appends the requested roots', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(LEVELS.slice(0, 12))).digest('hex'),
    '33de81b58ccada42280f28a33007356f71824c6354ab20778178836b8409d6c5');
  assert.equal(LEVELS.length, 26);
  assert.deepEqual(expansion.map(level => level.root), roots);
  assert.equal(new Set(LEVELS.map(level => level.root)).size, LEVELS.length);
  assert.deepEqual(LEVELS.map(level => level.id), Array.from({ length: 26 }, (_, i) => i + 1));
});

test('English expansion meets word, chunk, metadata and wheel-size rules', () => {
  assert.equal(DEFAULTS.wheelSlots, 5);
  for (const level of expansion) {
    assert.ok(level.words.length >= 8 && level.words.length <= 12, level.root);
    assert.equal(new Set(level.words.map(entry => entry.word)).size, level.words.length);
    let singles = 0;
    for (const { word, parts, open } of level.words) {
      assert.match(word, /^[A-Z]+$/);
      assert.equal(level.root + parts.join(''), word);
      assert.ok(word.length - level.root.length >= 4 && word.length - level.root.length <= 9, word);
      assert.ok(parts.length >= 2 && parts.length <= 3, word);
      assert.ok(parts.every(part => /^[A-Z]{1,3}$/.test(part)), word);
      singles += parts.filter(part => part.length === 1).length;
      assert.ok(open === undefined || typeof open === 'boolean', word);
    }
    assert.ok(singles <= 1, level.root);
    for (const wheelSlots of [5, 6, 7, 8]) validateLevel(level, { wheelSlots });
  }
});

// Offline lexical review fixtures, not a claim to be a complete English dictionary.
// Include likely omitted short words and derivations as well as actual targets:
// this catches unintended alternative spellings from any of a level's chunks.
const commonBranches = {
  BLACK: 'BIRD BERRY BOARD MAIL MAILER LIST JACK HEAD SMITH OUT TOP BURN',
  BLUE: 'BIRD BELL BERRY PRINT GRASS FISH BOTTLE MOON CHEESE',
  GREEN: 'HOUSE BACK ROOM BELT LIGHT THUMB GROCER GROCERY ENERGY WOOD FIELD',
  WHITE: 'BOARD WASH FISH BREAD RICE WINE NOISE PAPER CAP WATER',
  WIND: 'MILL FALL SOCK PIPE FARM CHILL SCREEN BREAK BREAKER SHIELD BURN UP',
  NIGHT: 'FALL TIME CLUB GOWN MARE LIGHT LIFE STAND SHIFT WATCH CAP',
  DAY: 'LIGHT BREAK DREAM DREAMER DREAMING TIME CARE TRIP SHIFT SCHOOL BOOK',
  PLAY: 'TIME ROOM MATE LIST BACK BOOK THING HOUSE GROUND GROUP PEN',
  FRUIT: 'CAKE JUICE SALAD BOWL TREE DRINK PUNCH BASKET COCKTAIL SMOOTHIE FLY',
  COFFEE: 'TABLE BEAN SHOP CAKE BREAK HOUSE MAKER FILTER GRINDER GROUNDS POT',
  TEA: 'TIME ROOM SPOON CAKE TOWEL PARTY LEAVES COSY GARDEN STRAINER POT BAG CUP',
  FLOWER: 'SHOP SHOW GIRL VASE STEM HEAD POWER GARDEN BASKET DELIVERY POT BED',
  BIRTH: 'DATE MARK RATE PLACE RIGHT STONE WEIGHT DEFECT MOTHER CONTROL DAY',
  HEAT: 'WAVE PUMP SINK RASH SHIELD STROKE CAPACITY TRANSFER TREATMENT EXCHANGER PROOF ED ER',
};

function spellable(rest, chunks, depth = 0) {
  if (!rest) return true;
  if (depth === 8) return false;
  // Allow repeated texts: refills can supply distinct nodes bearing the same chunk.
  return chunks.some(chunk => rest.startsWith(chunk) && spellable(rest.slice(chunk.length), chunks, depth + 1));
}

test('common prefix words and easy alternative chunk spellings are targets', () => {
  for (const level of expansion) {
    const targets = new Set(level.words.map(entry => entry.word));
    const common = commonBranches[level.root].split(' ').map(suffix => level.root + suffix);
    const chunks = [...new Set(level.words.flatMap(entry => entry.parts))];
    for (const { word, parts } of level.words) {
      assert.ok(common.includes(word), `${word}: review new targets for a genuine meaning link`);
      for (let k = 1; k < parts.length; k++) {
        const prefix = level.root + parts.slice(0, k).join('');
        assert.ok(!common.includes(prefix) || targets.has(prefix), `${word}: missing prefix ${prefix}`);
      }
    }
    for (const word of common) {
      assert.ok(!spellable(word.slice(level.root.length), chunks) || targets.has(word),
        `${level.root}: unintended common answer ${word}`);
    }
  }
  for (const [root, shorter, longer] of [
    ['WIND', 'WINDBREAK', 'WINDBREAKER'], ['DAY', 'DAYDREAM', 'DAYDREAMER'],
    ['DAY', 'DAYDREAM', 'DAYDREAMING'],
  ]) {
    const words = LEVELS.find(level => level.root === root).words;
    assert.ok(words.some(entry => entry.word === shorter));
    assert.ok(words.some(entry => entry.word === longer));
  }
});

test('the expansion eases in with fewer targets and builds toward longer remainders', () => {
  assert.ok(expansion.slice(0, 4).every(level => level.words.length === 8));
  assert.ok(expansion.slice(4).every(level => level.words.length === 10));
  const averageSuffix = levels => {
    const lengths = levels.flatMap(level => level.words.map(entry => entry.word.length - level.root.length));
    return lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  };
  assert.ok(averageSuffix(expansion.slice(-4)) > averageSuffix(expansion.slice(0, 4)));
  assert.ok(expansion.slice(0, 4).every(level => level.words.slice(0, 4).every(entry => entry.parts.length === 2)));
});

test('standard spaced compounds retain their display gaps', () => {
  for (const word of ['BLUEMOON', 'GREENLIGHT', 'WHITENOISE', 'WINDFARM', 'NIGHTSHIFT',
    'DAYTRIP', 'FRUITSALAD', 'COFFEETABLE', 'TEAPARTY', 'FLOWERGIRL', 'BIRTHCONTROL', 'HEATPUMP']) {
    assert.equal(expansion.flatMap(level => level.words).find(entry => entry.word === word)?.open, true, word);
  }
});

for (const level of expansion) {
  test(`English ${level.root}: playable to completion with 5–8 slots and preserved word gaps`, () => {
    for (const wheelSlots of [5, 6, 7, 8]) {
      for (const visibleRows of [1, 2, 4, 6]) {
        for (let seed = 0; seed < 20; seed++) {
          let state = createGame(level, { wheelSlots, visibleRows, seed });
          let steps = 0;
          while (!state.done) {
            assert.equal(state.wheel.length, wheelSlots);
            for (const row of state.rows) {
              assert.equal(row.open, level.words.find(entry => entry.word === row.word).open === true, row.word);
            }
            const choices = findSolutions(state);
            assert.ok(choices.length, `${level.root}: ${wheelSlots} slots, seed ${seed}, step ${steps}`);
            const outcome = submit(state, choices[(seed + steps) % choices.length].nodeIds);
            assert.equal(outcome.result.ok, true);
            state = outcome.state;
            assert.ok(++steps <= level.words.length);
          }
          assert.equal(steps, level.words.length);
          assert.deepEqual([...state.found].sort(), level.words.map(entry => entry.word).sort());
        }
      }
    }
  });
}
