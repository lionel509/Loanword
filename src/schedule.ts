import type { Card } from "./deck";

/** A review finished at 23:50 must not come back at 00:05. */
export const ROLLOVER_HOUR = 4;
/** Days until due, by box (index 0 unused). */
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;

export interface Rec { box: number; due: string; seen: number; right: number; wrong: number; updated: number }
export type Mode = "review" | "note";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayKey(nowMs: number): string {
  return key(new Date(nowMs - ROLLOVER_HOUR * 3600e3));
}

export function addDays(k: string, n: number): string {
  const [y, m, d] = k.split("-").map(Number);
  return key(new Date(y, m - 1, d + n));
}

export function grade(rec: Rec | undefined, right: boolean, mode: Mode, today: string, nowMs: number): Rec {
  const r: Rec = rec
    ? { ...rec, seen: rec.seen + 1, right: rec.right + (right ? 1 : 0), wrong: rec.wrong + (right ? 0 : 1), updated: nowMs }
    : { box: 0, due: today, seen: 1, right: right ? 1 : 0, wrong: right ? 0 : 1, updated: nowMs };
  const tomorrow = addDays(today, 1);
  if (right) {
    if (mode === "note" && rec && rec.due > today) return r;   // not due: only seen/right tick
    r.box = Math.min(r.box + 1, MAX_BOX);
    r.due = addDays(today, INTERVALS[r.box]);
  } else {
    r.box = mode === "note" && rec ? Math.max(1, rec.box - 1) : 1;
    r.due = tomorrow;
  }
  return r;
}

export interface Session { due: Card[]; fresh: Card[] }

export function buildSession(
  deck: Card[], items: Record<string, Rec>, introducedToday: string[],
  today: string, newPerDay: number, maxDue = 50,
): Session {
  const due = deck
    .filter((c) => items[c.id] && items[c.id].due <= today)
    .sort((a, b) => {
      const da = items[a.id].due, db = items[b.id].due;
      return (da < db ? -1 : da > db ? 1 : 0) || a.unit - b.unit || a.order - b.order;
    })
    .slice(0, maxDue);
  const fresh = deck
    .filter((c) => !items[c.id])
    .sort((a, b) => a.unit - b.unit || a.order - b.order)
    .slice(0, Math.max(0, newPerDay - introducedToday.length));
  return { due, fresh };
}

export function isDone(s: Session): boolean {
  return s.due.length === 0 && s.fresh.length === 0;
}

export interface Tally { fresh: number; learning: number; known: number }

export function tally(deck: Card[], items: Record<string, Rec>): Map<number, Tally> {
  const out = new Map<number, Tally>();
  for (const c of deck) {
    let t = out.get(c.unit);
    if (!t) out.set(c.unit, (t = { fresh: 0, learning: 0, known: 0 }));
    const r = items[c.id];
    if (!r) t.fresh++;
    else if (r.box >= 4) t.known++;
    else t.learning++;
  }
  return out;
}
