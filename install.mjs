/** Copy the built plugin into every vault that should review and swap.
 *
 *  Override with OBSIDIAN_VAULT (the umbrella folder), OBSIDIAN_VAULTS (a
 *  colon-separated list of vault paths, replacing the list entirely) and
 *  OBSIDIAN_DECK (the deck folder) so this works for anyone who clones it.
 *
 *  Vanguard is refused by name, whatever the list says — it is off-limits.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
// ponytail: imports the .ts directly; needs Node >= 22.18 for type stripping
import { forbiddenPath } from "./src/settings.ts";

export function forbidden(vaultPath) {
  return forbiddenPath(resolve(vaultPath));
}

/** Seed only what is unset, so a re-run never undoes a choice. */
export function seedData(existing, { deckPath, hasVanguardFolder }) {
  const out = { ...(existing ?? {}) };
  if (!out.deckPath) out.deckPath = deckPath;
  if (hasVanguardFolder) {
    const ex = Array.isArray(out.excludedFolders) ? [...out.excludedFolders] : [];
    if (!ex.includes("Vanguard")) ex.push("Vanguard");
    out.excludedFolders = ex;
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const DOCS = process.env.OBSIDIAN_VAULT ?? "/Users/lionelweng/Documents";
  const VAULTS = process.env.OBSIDIAN_VAULTS
    ? process.env.OBSIDIAN_VAULTS.split(":").filter(Boolean)
    : [DOCS, ...["BlackRock", "State Street", "Berkshire", "Goldman", "Fidelity", "Citadel", "Bridgewater", "Mirae"]
        .map((v) => `${DOCS}/${v}`)];
  const DECK = process.env.OBSIDIAN_DECK ?? `${DOCS}/Mirae/Deck`;

  for (const vault of VAULTS) {
    if (forbidden(vault)) {
      console.error(`refused ${vault} — Vanguard is off-limits`);
      process.exitCode = 1;
      continue;
    }
    if (!existsSync(join(vault, ".obsidian"))) {
      console.log(`skipped ${vault} — not an Obsidian vault`);
      continue;
    }
    const target = join(vault, ".obsidian/plugins/loanword");
    mkdirSync(target, { recursive: true });
    for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(file, join(target, file));
    console.log(`installed -> ${target}`);

    const listPath = join(vault, ".obsidian/community-plugins.json");
    const list = readJson(listPath);
    if (Array.isArray(list)) {
      if (!list.includes("loanword")) {
        list.push("loanword");
        writeFileSync(listPath, `${JSON.stringify(list, null, 2)}\n`);
        console.log("  enabled");
      }
    } else {
      console.log(`  could not read ${listPath} — enable Loanword by hand`);
    }

    const dataPath = join(target, "data.json");
    const data = seedData(readJson(dataPath), { deckPath: DECK, hasVanguardFolder: existsSync(join(vault, "Vanguard")) });
    writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  }

  console.log("\nReload each vault now (Cmd-R) so Obsidian reads these from disk.");
}
