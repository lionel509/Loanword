import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY, mergeProgress, Store } from "../.testbuild/store.mjs";

const rec = (updated, box = 1) => ({ box, due: "2026-10-03", seen: 1, right: 1, wrong: 0, updated });
const clone = (o) => JSON.parse(JSON.stringify(o));
const tmp = () => join(mkdtempSync(join(tmpdir(), "loanword-")), "progress.json");

test("mergeProgress", () => {
  const file = { ...clone(EMPTY),
    items: { a: rec(5, 1), b: rec(9, 3) },
    days: { d: { introduced: ["x", "y"], reviews: 2 } },
    drip: { next: 100, at: 10 }, pause: { until: "", at: 1 },
    prompt: { day: "d", owner: "f", at: 1 } };
  const mem = { ...clone(EMPTY),
    items: { a: rec(9, 2), b: rec(5, 1), c: rec(1) },
    days: { d: { introduced: ["z", "x"], reviews: 5 } },
    drip: { next: 50, at: 20 }, pause: { until: "2026-10-09", at: 2 },
    prompt: { day: "d", owner: "m", at: 9 } };
  const m = mergeProgress(file, mem);
  assert.equal(m.items.a.updated, 9);
  assert.equal(m.items.b.updated, 9);
  assert.ok(m.items.c);
  assert.deepEqual(m.days.d, { introduced: ["x", "y", "z"], reviews: 5 });
  assert.deepEqual(m.drip, { next: 50, at: 20 });
  assert.deepEqual(mergeProgress(file, { ...mem, drip: { next: 50, at: 5 } }).drip, file.drip);
  assert.deepEqual(m.pause, { until: "2026-10-09", at: 2 });
  assert.deepEqual(m.prompt, file.prompt);
  assert.equal(mergeProgress({ ...file, prompt: null }, mem).prompt, null);
});

test("two stores share one file", () => {
  const f = tmp();
  const a = new Store(f), b = new Store(f);
  a.update((s) => { s.items["zh:水"] = rec(1); });
  b.update((s) => { s.items["ko:물"] = rec(2); });
  a.load(); b.load();
  for (const s of [a, b]) assert.deepEqual(Object.keys(s.state.items).sort(), ["ko:물", "zh:水"]);
});

test("update leaves no tmp and writes valid JSON", () => {
  const f = tmp();
  new Store(f).update((s) => { s.items.a = rec(1); });
  const dir = join(f, "..");
  assert.ok(!readdirSync(dir).some((n) => n.includes(".tmp.")));
  assert.ok(JSON.parse(readFileSync(f, "utf8")).items.a);
});

test("corrupt file is set aside", () => {
  const f = tmp();
  const s = new Store(f);
  s.state.items.keep = rec(1);
  writeFileSync(f, "{");
  s.load();
  assert.ok(s.state.items.keep);
  assert.ok(readdirSync(join(f, "..")).some((n) => n.startsWith("progress.json.corrupt-")));
});

test("watch sees another store's update", async () => {
  const f = tmp();
  const a = new Store(f), b = new Store(f);
  a.update(() => {});
  let stop;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no change event")), 1000);
    stop = a.watch(() => { clearTimeout(t); resolve(); });
    setTimeout(() => b.update((s) => { s.items.x = rec(3); }), 50);
  }).finally(() => stop?.());
});

test("R10: wrong-shaped file is set aside, memory kept", () => {
  const f = tmp();
  const s = new Store(f);
  s.state.items.keep = rec(1);
  writeFileSync(f, '{"items":null}');
  assert.doesNotThrow(() => s.load());
  assert.ok(s.state.items.keep);
  assert.ok(readdirSync(join(f, "..")).some((n) => n.startsWith("progress.json.corrupt-")));
});

test("v1 file without drip or notBefore loads unchanged", () => {
  const f = tmp();
  writeFileSync(f, '{"version":1,"items":{"a":{"box":2,"due":"2026-10-03","seen":1,"right":1,"wrong":0,"updated":5}},"days":{},"snooze":{"until":0,"at":0},"pause":{"until":"","at":0},"prompt":null}');
  const s = new Store(f);
  s.load();
  assert.deepEqual(s.state.drip, { next: 0, at: 0 });
  assert.equal(s.state.items.a.notBefore, undefined);
  assert.ok(!("snooze" in s.state));
  assert.ok(!readdirSync(join(f, "..")).some((n) => n.startsWith("progress.json.corrupt-")));
});
