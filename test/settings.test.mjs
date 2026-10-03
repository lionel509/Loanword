import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, forbiddenPath, isExcluded } from "../.testbuild/settings.mjs";

test("defaults", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    deckPath: "", newPerDay: 5, swapEvery: 60, maxSwapsPerNote: 12,
    swapScript: "both", swapsEnabled: true, excludedFolders: [],
  });
  assert.ok(!JSON.stringify(DEFAULT_SETTINGS).includes("/Users/"));
});

test("isExcluded", () => {
  assert.equal(isExcluded("Vanguard/a.md", ["Vanguard"]), true);
  assert.equal(isExcluded("vanguard/a.md", ["Vanguard"]), true);
  assert.equal(isExcluded("VanguardX/a.md", ["Vanguard"]), false);
  assert.equal(isExcluded("a.md", []), false);
  assert.equal(isExcluded("Deck/x.md", ["Deck/"]), true);
});

test("forbiddenPath", () => {
  for (const p of ["/x/Documents/Vanguard", "/x/Documents/vanguard/Deck"]) assert.equal(forbiddenPath(p), true, p);
  for (const p of ["/x/Documents/Mirae/Deck", "/x/VanguardNotes"]) assert.equal(forbiddenPath(p), false, p);
});
