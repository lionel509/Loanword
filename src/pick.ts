import type { Card } from "./deck";
import { fnv1a } from "./hash";

export type Lexicon = Record<string, Card[]>;
export interface Pick { from: number; to: number; card: Card; word: string }

/** Expand from the swap word rather than singularizing the text. */
export function pluralsOf(w: string): string[] {
  const out = [w, w + "s"];
  if (/(s|x|z|ch|sh)$/.test(w)) out.push(w + "es");
  if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + "ies");
  return out;
}

export function buildLexicon(
  cards: Card[], introduced: (id: string) => boolean, script: "zh" | "ko" | "both",
): Lexicon {
  const lex: Lexicon = {};
  for (const c of cards) {
    if (!c.swap.length || !introduced(c.id)) continue;
    if (script !== "both" && c.script !== script) continue;
    for (const w of c.swap) {
      for (const f of pluralsOf(w)) {
        const list = lex[f] ?? (lex[f] = []);
        if (!list.includes(c)) list.push(c);
      }
    }
  }
  return lex;
}

/** Obsidian's node names are joined CM5 classes, so match by substring. */
export const SKIP_NODE = [
  "codeblock", "inline-code", "math", "frontmatter", "header", "link", "url", "tag",
  "comment", "html", "table", "escape", "hr", "footref",
];

export function skipNode(name: string): boolean {
  return SKIP_NODE.some((s) => name.includes(s));
}

export function frontmatterEnd(text: string): number {
  const m = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  return m ? m[0].length : 0;
}

// ponytail: whole-doc scan per edit; per-line cache if a 100k-word note ever shows up
export function pickSwaps(text: string, lex: Lexicon, path: string, every: number, max: number): Pick[] {
  const start = frontmatterEnd(text);
  const nth: Record<string, number> = {};
  const cands: { idx: number; score: number; pick: Pick }[] = [];
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  let m: RegExpExecArray | null;
  let idx = -1;
  while ((m = re.exec(text))) {
    idx++;
    if (m.index < start) continue;
    const w = m[0].toLowerCase();
    const cards = lex[w];
    if (!cards) continue;
    const n = (nth[w] = (nth[w] ?? -1) + 1);
    const score = fnv1a(path + "\0" + w + "\0" + n);
    cands.push({ idx, score, pick: { from: m.index, to: m.index + m[0].length, card: cards[score % cards.length], word: m[0] } });
  }
  cands.sort((a, b) => a.score - b.score || a.idx - b.idx);
  const taken: typeof cands = [];
  for (const c of cands) {
    if (taken.length >= max) break;
    if (taken.every((t) => Math.abs(t.idx - c.idx) >= every)) taken.push(c);
  }
  return taken.map((t) => t.pick).sort((a, b) => a.from - b.from);
}

export function visiblePicks<P extends { from: number; to: number }>(picks: P[], skip: [number, number][]): P[] {
  return picks.filter((p) => !skip.some(([from, to]) => p.from < to && p.to > from));
}
