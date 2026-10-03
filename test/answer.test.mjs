import test from "node:test";
import assert from "node:assert/strict";
import { alternatives, withinOne, checkAnswer } from "../.testbuild/answer.mjs";

const rows = [
  ["water", "water (radical)", true],
  [" Water ", "water", true],
  ["day", "sun, day", true],
  ["feeling", "heart, feeling (radical)", true],
  ["exit", "exit (Chinese also: export)", true],
  ["export", "exit (Chinese also: export)", false],
  ["white", "white (the colour; everyday Korean 흰색)", true],
  ["colour", "white (the colour; everyday Korean 흰색)", false],
  ["wednsday", "Wednesday", true],
  ["wensday", "Wednesday", false],
  ["mountian", "mountain", true],
  ["mountains", "mountain", true],
  ["word", "speech, words", true],
  ["son", "sun, day", false],
  ["fire", "fire", true],
  ["five", "fire", false],
  ["to go out", "go out", true],
  ["hotspring", "hot spring", true],
  ["munday", "Monday", true],
  ["sunday", "Monday", false],
  ["tuesday", "Thursday", false],
  ["", "water", false],
  ["   ", "water", false],
];

test("checkAnswer", () => {
  for (const [typed, meaning, want] of rows) {
    assert.equal(checkAnswer(typed, meaning), want, JSON.stringify([typed, meaning]));
  }
});

test("alternatives", () => {
  assert.deepEqual(alternatives("heart, feeling (radical)"), ["heart", "feeling"]);
});

test("withinOne", () => {
  assert.equal(withinOne("ab", "ba"), true);
  assert.equal(withinOne("abc", "abc"), true);
  assert.equal(withinOne("abc", "xyz"), false);
});
