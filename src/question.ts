import type { Card } from "./deck";
import { seeded } from "./hash";

export interface Question { card: Card; prompt: string; options: string[]; answer: number }

/** "water (radical)" and "water" are the same answer to a guesser (A1). */
export function baseMeaning(m: string): string {
  return m.replace(/\s*\(.*$/, "").trim().toLowerCase();
}

/** Option label: the meaning without its parenthetical, case kept. */
export function displayMeaning(m: string): string {
  return m.replace(/\s*\(.*$/, "").trim();
}

/** One meaning per distinct base meaning, excluding the card's own. */
function distinct(cards: Card[], own: string): string[] {
  const seen = new Set([own]);
  const out: string[] = [];
  for (const c of cards) {
    const b = baseMeaning(c.meaning);
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(c.meaning);
  }
  return out;
}

export function makeQuestion(card: Card, deck: Card[], seed: number): Question {
  const own = baseMeaning(card.meaning);
  const sameUnit = distinct(deck.filter((c) => c.unit === card.unit), own);
  const pool = sameUnit.length >= 2 ? sameUnit : distinct(deck, own);
  const rng = seeded(seed);
  const options: string[] = [];
  while (options.length < 2 && pool.length) {
    options.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const answer = Math.min(Math.floor(rng() * 3), options.length);
  options.splice(answer, 0, card.meaning);
  return { card, prompt: card.form, options, answer };
}
