import test from "node:test";
import assert from "node:assert/strict";
import { forbidden, seedData } from "../install.mjs";

test("forbidden", () => {
  for (const p of ["/x/Documents/Vanguard", "/x/Documents/vanguard/", "/x/Vanguard/.obsidian"]) assert.equal(forbidden(p), true, p);
  for (const p of ["/x/Documents", "/x/VanguardNotes"]) assert.equal(forbidden(p), false, p);
});

test("seedData", () => {
  assert.deepEqual(seedData(null, { deckPath: "/d", hasVanguardFolder: true }), { deckPath: "/d", excludedFolders: ["Vanguard"] });
  const mine = { deckPath: "/mine", excludedFolders: ["Vanguard"] };
  assert.deepEqual(seedData(mine, { deckPath: "/d", hasVanguardFolder: true }), mine);
  assert.deepEqual(seedData({}, { deckPath: "/d", hasVanguardFolder: false }), { deckPath: "/d" });
});
