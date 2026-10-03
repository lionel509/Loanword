import type { Card } from "./deck";
import type { Session } from "./schedule";

export type Kind = "recall" | "meet";
export interface QueueItem { card: Card; kind: Kind }

/** now + a whole number of minutes drawn from [min, max]; rnd is in [0,1) (Math.random() at the call site). */
export function nextDripAt(nowMs: number, minMin: number, maxMin: number, rnd: number): number {
  const lo = Math.min(minMin, maxMin), hi = Math.max(minMin, maxMin);
  return nowMs + (lo + Math.floor(rnd * (hi - lo + 1))) * 60e3;
}

export interface Gate { focused: boolean; lastKeyAt: number; paused: boolean; done: boolean; claimFree: boolean; nextAt: number }

export function shouldFire(g: Gate, nowMs: number, idleSeconds: number): boolean {
  return g.focused && !g.paused && !g.done && g.claimFree && nowMs >= g.nextAt && nowMs - g.lastKeyAt >= idleSeconds * 1000;
}

/** Due cards first, then at most one new card if there is room; n = Infinity for "Review now". */
export function pickDrip(s: Session, n: number): QueueItem[] {
  const out: QueueItem[] = s.due.slice(0, n).map((card) => ({ card, kind: "recall" as const }));
  if (out.length < n && s.fresh[0]) out.push({ card: s.fresh[0], kind: "meet" });
  return out;
}

/** "next ~23 min" | "next now". With nothing askable, the next drip cannot land before waitUntil. */
export function nextLabel(s: Session, nextAt: number, nowMs: number): string {
  const at = s.due.length || s.fresh.length ? nextAt : Math.max(nextAt, s.waitUntil);
  return at <= nowMs ? "next now" : `next ~${Math.ceil((at - nowMs) / 60e3)} min`;
}
