import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseDeck, parseDeckNote, splitRow } from "../.testbuild/deck.mjs";

const HEAD = "| zh | pinyin | ko | hanja | meaning | swap |\n|---|---|---|---|---|---|";
const ROWS = [
  "| 水 | shuǐ | 물 | 水 | water | water |",
  "| 氵 | sāndiǎnshuǐ | | | water radical (three dots) | |",
  "| | | 월요일 | 月曜日 | Monday | monday |",
  "|  出口  | chūkǒu | 출구 | 出口 |  exit · way out  | exit |",
  "| 山 |",
  "| 火 | huǒ | 불 | 火 | | fire |",
];
const note = (rows, fm = "---\nunit: 1\n---\n") =>
  `${fm}# Deck\n\nSome prose here.\n\n${HEAD}\n${rows.join("\n")}\n\nMore prose.\n| not | a | table |\n`;

test("fixture yields exactly the six cards", () => {
  const cards = parseDeckNote(note(ROWS), 0);
  assert.deepEqual(cards.map((c) => c.id), ["zh:水", "ko:물", "zh:氵", "ko:월요일", "zh:出口", "ko:출구"]);
});

test("readings: pinyin for zh, hanja for ko", () => {
  const cards = parseDeckNote(note(ROWS), 0);
  const r = cards.find((c) => c.id === "zh:氵");
  assert.deepEqual(r.swap, []);
  assert.equal(r.reading, "sāndiǎnshuǐ");
  assert.equal(r.ko, "");
  const k = cards.find((c) => c.id === "ko:물");
  assert.equal(k.reading, "水");
  assert.equal(k.script, "ko");
});

test("cells are trimmed", () => {
  const c = parseDeckNote(note(ROWS), 0).find((c) => c.id === "zh:出口");
  assert.equal(c.meaning, "exit · way out");
  assert.equal(c.form, "出口");
});

test("unit from frontmatter, else fallback", () => {
  assert.ok(parseDeckNote(note(ROWS), 0).every((c) => c.unit === 1));
  assert.ok(parseDeckNote(note(ROWS, ""), 7).every((c) => c.unit === 7));
});

test("ids survive reorder and insertion", () => {
  const ids = (rows) => new Set(parseDeckNote(note(rows), 0).map((c) => c.id));
  const a = ids(ROWS);
  const b = ids(["| 木 | mù | 나무 | 木 | tree | |", ...[...ROWS].reverse()]);
  for (const id of a) assert.ok(b.has(id), id);
});

test("duplicates across notes: first wins", () => {
  const cards = parseDeck([
    { name: "B", text: note(["| 水 | shuǐ | | | second | |"]) },
    { name: "A", text: note(["| 水 | shuǐ | | | first | |"]) },
  ]);
  assert.equal(cards.filter((c) => c.id === "zh:水").length, 1);
  assert.equal(cards.find((c) => c.id === "zh:水").meaning, "first");
  assert.deepEqual(cards.map((c) => c.order), cards.map((_, i) => i));
});

test("wrong header and garbage give [] without throwing", () => {
  assert.deepEqual(parseDeckNote("| zh | ko | meaning |\n|---|---|---|\n| 水 | 물 | water |\n", 0), []);
  assert.deepEqual(parseDeckNote("---\n:::", 0), []);
  assert.deepEqual(parseDeck([{ name: "x", text: "---\n:::" }]), []);
});

test("swap: multi-word tokens dropped, lowercased", () => {
  const c = parseDeckNote(note(["| 冰 | bīng | | | ice | water, Ice Water, cold |"]), 0)[0];
  assert.deepEqual(c.swap, ["water", "cold"]);
});

test("splitRow", () => {
  assert.equal(splitRow("not a row"), null);
  assert.deepEqual(splitRow(" | a | b |"), ["a", "b"]);
});

const REAL = "/Users/lionelweng/Documents/Mirae/Deck/Unit 1 — Deck.md";
test("real deck smoke test", { skip: !existsSync(REAL) }, () => {
  const cards = parseDeck([{ name: "Unit 1 — Deck", text: readFileSync(REAL, "utf8") }]);
  assert.ok(cards.length > 50, String(cards.length));
  assert.ok(cards.every((c) => c.form && c.meaning));
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
});
