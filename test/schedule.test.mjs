import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, addDays, grade, buildSession, isDone, tally } from "../.testbuild/schedule.mjs";

const T = "2026-10-02";
const rec = (o) => ({ box: 1, due: T, seen: 0, right: 0, wrong: 0, updated: 0, ...o });

test("dayKey rolls over at 04:00", () => {
  assert.equal(dayKey(new Date(2026, 9, 3, 3, 59).getTime()), "2026-10-02");
  assert.equal(dayKey(new Date(2026, 9, 3, 4, 0).getTime()), "2026-10-03");
});

test("addDays crosses months", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("new card right → box 1, tomorrow", () => {
  assert.deepEqual(grade(undefined, true, "review", T, 1),
    { box: 1, due: "2026-10-03", seen: 1, right: 1, wrong: 0, updated: 1 });
});

test("review right promotes with the right interval", () => {
  const r = grade(rec({ box: 2 }), true, "review", T, 5);
  assert.equal(r.box, 3);
  assert.equal(r.due, addDays(T, 7));
  const top = grade(rec({ box: 5 }), true, "review", T, 5);
  assert.equal(top.box, 5);
  assert.equal(top.due, addDays(T, 30));
});

test("review wrong resets to box 1", () => {
  const r = grade(rec({ box: 4 }), false, "review", T, 5);
  assert.equal(r.box, 1);
  assert.equal(r.due, addDays(T, 1));
  assert.equal(r.wrong, 1);
});

test("note right promotes only a due card", () => {
  const a = grade(rec({ box: 3, due: T }), true, "note", T, 5);
  assert.equal(a.box, 4);
  assert.equal(a.due, addDays(T, 14));
  const tm = addDays(T, 1);
  const b = grade(rec({ box: 3, due: tm }), true, "note", T, 5);
  assert.equal(b.box, 3);
  assert.equal(b.due, tm);
  assert.equal(b.right, 1);
});

test("note wrong demotes one box, floor 1", () => {
  const a = grade(rec({ box: 3 }), false, "note", T, 5);
  assert.equal(a.box, 2);
  assert.equal(a.due, addDays(T, 1));
  assert.equal(grade(rec({ box: 1 }), false, "note", T, 5).box, 1);
});

const deck = Array.from({ length: 12 }, (_, i) => ({
  id: `zh:${i}`, unit: i < 6 ? 2 : 1, order: i, script: "zh", form: String(i), meaning: `m${i}`, swap: [],
}));

test("buildSession", () => {
  const items = {
    "zh:0": rec({ due: T }), "zh:1": rec({ due: "2026-09-20" }), "zh:6": rec({ due: "2026-10-01" }),
    "zh:2": rec({ due: "2026-10-05" }), "zh:7": rec({ due: "2026-10-09" }),
  };
  const s = buildSession(deck, items, [], T, 5);
  assert.deepEqual(s.due.map((c) => c.id), ["zh:1", "zh:6", "zh:0"]);
  assert.equal(s.fresh.length, 5);
  assert.ok(s.fresh.every((c) => !items[c.id]));
  assert.deepEqual(s.fresh.map((c) => c.id), ["zh:8", "zh:9", "zh:10", "zh:11", "zh:3"]);
  assert.equal(isDone(s), false);

  const s2 = buildSession(deck, items, ["a", "b", "c", "d", "e"], T, 5);
  assert.deepEqual(s2.fresh, []);
  assert.equal(isDone(s2), false);
  assert.equal(isDone(buildSession(deck, {}, ["a", "b", "c", "d", "e"], T, 5)), true);
  assert.equal(buildSession(deck, items, [], T, 5, 2).due.length, 2);
});

test("tally", () => {
  const t = tally(deck, { "zh:0": rec({ box: 4 }), "zh:1": rec({ box: 3 }), "zh:6": rec({ box: 5 }) });
  assert.deepEqual(t.get(2), { fresh: 4, learning: 1, known: 1 });
  assert.deepEqual(t.get(1), { fresh: 5, learning: 0, known: 1 });
});
