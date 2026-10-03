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
  // "days" is too short for typo tolerance, so only a stem on the meaning side can accept it.
  ["day", "days", true],
  // Tolerance starts at 6 letters: at 5, deck meanings and common words are one edit apart.
  ["mouth", "moon, month", false],
  ["month", "mouth", false],
  ["woods", "speech, words", false],
  ["honey", "money", false],
  // "days" against "day" is 4 letters, so only a stem on the typed side accepts it.
  ["days", "sun, day", true],
  // "s" stems to "", so only the empty-answer guard rejects an empty string here.
  ["", "s", false],
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
