import test from "node:test";
import assert from "node:assert/strict";
import { makeQuestion, baseMeaning, displayMeaning } from "../.testbuild/question.mjs";

let n = 0;
const card = (form, meaning, unit = 1) => ({ id: `zh:${form}`, script: "zh", form, meaning, unit, order: n++, swap: [] });
const deck = [
  ...["water", "fire", "mountain", "river", "tree", "sun", "moon", "gold", "earth", "wood"].map((m, i) => card(`a${i}`, m, 1)),
  ...["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].map((m, i) => card(`b${i}`, m, 2)),
];

test("seeded: same seed same question, different seeds vary", () => {
  let differs = 0;
  for (const c of deck) {
    const a = makeQuestion(c, deck, 42), b = makeQuestion(c, deck, 42), d = makeQuestion(c, deck, 43);
    assert.deepEqual(a.options, b.options);
    assert.equal(a.answer, b.answer);
    if (JSON.stringify(a.options) !== JSON.stringify(d.options)) differs++;
  }
  assert.ok(differs > 0);
});

test("three distinct options, correct exactly once", () => {
  for (const c of deck) {
    for (let s = 0; s < 10; s++) {
      const q = makeQuestion(c, deck, s);
      assert.equal(q.prompt, c.form);
      assert.equal(q.options.length, 3);
      assert.equal(q.options[q.answer], c.meaning);
      assert.equal(new Set(q.options).size, 3);
      assert.equal(q.options.filter((o) => o === c.meaning).length, 1);
    }
  }
});

test("distractors from the same unit", () => {
  const unit1 = new Set(deck.filter((c) => c.unit === 1).map((c) => c.meaning));
  for (let s = 0; s < 20; s++) {
    const q = makeQuestion(deck[0], deck, s);
    assert.ok(q.options.every((o) => unit1.has(o)));
  }
});

test("tiny deck does not throw", () => {
  const tiny = [card("x", "water"), card("y", "fire")];
  const q = makeQuestion(tiny[0], tiny, 1);
  assert.equal(q.options.length, 2);
  assert.equal(q.options[q.answer], "water");
});

test("A1: near-duplicate meanings are never distractors", () => {
  assert.equal(baseMeaning("Water (radical)"), "water");
  const d = [card("水", "water"), card("氵", "water (radical)"), card("山", "mountain"), card("江", "river")];
  for (let s = 0; s < 100; s++) {
    const q = makeQuestion(d[0], d, s);
    assert.ok(!q.options.includes("water (radical)"), String(s));
  }
});

test("R5: own-side compare uses the base meaning", () => {
  const d = [card("氵", "water (radical)"), card("水", "water"), card("山", "mountain"), card("江", "river")];
  for (let s = 0; s < 100; s++) {
    const q = makeQuestion(d[0], d, s);
    const others = q.options.filter((_, i) => i !== q.answer);
    assert.ok(!others.some((o) => baseMeaning(o) === "water"), String(s));
  }
});

test("R5: option base meanings are pairwise distinct", () => {
  const d = [card("山", "mountain"), card("水", "water"), card("氵", "water (radical)"), card("江", "river")];
  for (let s = 0; s < 100; s++) {
    const q = makeQuestion(d[0], d, s);
    assert.equal(new Set(q.options.map(baseMeaning)).size, q.options.length, String(s));
  }
});

test("displayMeaning strips the parenthetical, keeps case", () => {
  assert.equal(displayMeaning("exit (Chinese also: export)"), "exit");
  assert.equal(displayMeaning("Monday"), "Monday");
});
