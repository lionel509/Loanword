import test from "node:test";
import assert from "node:assert/strict";
import { pluralsOf, buildLexicon, skipNode, frontmatterEnd, pickSwaps, visiblePicks } from "../.testbuild/pick.mjs";

const card = (id, script, swap) => ({ id, script, form: id.slice(3), swap, meaning: swap[0] ?? "x", unit: 1, order: 0 });
const water = card("zh:水", "zh", ["water"]);
const mountain = card("ko:산", "ko", ["mountain"]);
const lexOf = (cards) => buildLexicon(cards, () => true, "both");

test("pluralsOf", () => {
  for (const w of ["mountain", "mountains"]) assert.ok(pluralsOf("mountain").includes(w));
  assert.ok(pluralsOf("box").includes("boxes"));
  assert.ok(pluralsOf("city").includes("cities"));
  assert.ok(pluralsOf("day").includes("days"));
  assert.ok(!pluralsOf("day").includes("daies"));
});

test("buildLexicon", () => {
  const river = card("zh:江", "zh", ["river"]);
  const none = card("zh:氵", "zh", []);
  const lex = buildLexicon([water, mountain, river, none], (id) => id !== "zh:江", "both");
  assert.equal(lex.river, undefined);
  assert.deepEqual(lex.mountains, [mountain]);
  assert.deepEqual(lex.water, [water]);
  const ko = buildLexicon([water, mountain], () => true, "ko");
  assert.equal(ko.water, undefined);
  assert.ok(ko.mountain);
});

test("skipNode", () => {
  for (const n of ["HyperMD-codeblock_HyperMD-codeblock-bg_hmd-codeblock", "inline-code", "math_math-2",
    "formatting-math_formatting-math-begin_keyword_math", "hmd-frontmatter", "header_header-2",
    "hmd-internal-link", "string_url", "hashtag_hashtag-end", "comment", "HyperMD-table-row_HyperMD-table-row-1"]) {
    assert.equal(skipNode(n), true, n);
  }
  for (const n of ["strong", "em", "list-1", "quote_quote-1"]) assert.equal(skipNode(n), false, n);
});

test("frontmatterEnd", () => {
  const t = "---\ntitle: water\n---\nwater";
  assert.equal(frontmatterEnd(t), t.lastIndexOf("water"));
  assert.equal(frontmatterEnd("water"), 0);
});

const filler = (n, w = "lorem") => Array.from({ length: n }, (_, i) => `${w}${i % 7 ? "a" : "b"}`);
function waterText(every = 10, words = 600) {
  const out = [];
  for (let i = 0; i < words; i++) out.push(i % every === 0 ? "water" : "lorem");
  return out.join(" ");
}

test("determinism and path dependence", () => {
  const nouns = ["water", "mountain", "river"];
  const cards = nouns.map((w, i) => card(`zh:${i}`, "zh", [w]));
  const lex = lexOf(cards);
  const out = [];
  for (let i = 0; i < 600; i++) out.push(i % 20 === 0 ? nouns[i % 3] : "lorem");
  const text = out.join(" ");
  const a = pickSwaps(text, lex, "A/b.md", 60, 12);
  assert.deepEqual(a, pickSwaps(text, lex, "A/b.md", 60, 12));
  const b = pickSwaps(text, lex, "B/c.md", 60, 12);
  assert.notDeepEqual(b.map((x) => x.from), a.map((x) => x.from));
});

test("density and cap", () => {
  const text = waterText();
  const lex = lexOf([water]);
  const picks = pickSwaps(text, lex, "a.md", 60, 12);
  assert.ok(picks.length <= 10 && picks.length > 0);
  const idx = picks.map((p) => text.slice(0, p.from).split(" ").length - 1);
  for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) assert.ok(Math.abs(idx[i] - idx[j]) >= 60);
  assert.equal(pickSwaps(text, lex, "a.md", 60, 3).length, 3);
});

test("stable under typing", () => {
  const text = waterText();
  const lex = lexOf([water]);
  const a = pickSwaps(text, lex, "a.md", 60, 12);
  const appended = pickSwaps(text + " " + filler(50).join(" "), lex, "a.md", 60, 12);
  assert.deepEqual(appended, a);
  const pre = "one two three four five ";
  const shifted = pickSwaps(pre + text, lex, "a.md", 60, 12);
  assert.deepEqual(shifted.map((p) => p.from - pre.length), a.map((p) => p.from));
});

test("plural pick covers the whole word", () => {
  const p = pickSwaps("the mountains are high", lexOf([mountain]), "a.md", 60, 12);
  assert.equal(p.length, 1);
  assert.equal(p[0].to - p[0].from, 9);
  assert.equal(p[0].card, mountain);
});

test("visiblePicks", () => {
  const picks = [{ from: 10, to: 15 }, { from: 20, to: 25 }];
  assert.deepEqual(visiblePicks(picks, [[25, 40], [8, 16]]), [{ from: 20, to: 25 }]);
});

test("frontmatter words are never candidates", () => {
  const p = pickSwaps("---\ntitle: water\n---\nhello", lexOf([water]), "a.md", 60, 12);
  assert.deepEqual(p, []);
});

test("empty and huge", () => {
  const lex = lexOf([water]);
  assert.deepEqual(pickSwaps("", lex, "a.md", 60, 12), []);
  assert.ok(pickSwaps("water ".repeat(50000), lex, "a.md", 60, 12).length <= 12);
});
