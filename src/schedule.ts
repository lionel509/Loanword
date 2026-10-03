import type { Card } from "./deck";

/** A review finished at 23:50 must not come back at 00:05. */
export const ROLLOVER_HOUR = 4;
/** Days until due, by box (index 0 unused). */
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;

export interface Rec { box: number; due: string; seen: number; right: number; wrong: number; updated: number;
  /** ms epoch; present iff box === 0 (met or missed today): not askable before this. */ notBefore?: number }
export const RELEARN_MS = 30 * 60e3;   // a missed recall comes back after this
export const MEET_MS = 60 * 60e3;      // a met card gets its cold recall after this
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

export function isDue(rec: Rec | undefined, today: string, nowMs: number): boolean {
  return !!rec && rec.due <= today && (rec.notBefore ?? 0) <= nowMs;
}

export function meet(nowMs: number, today: string): Rec {
  return { box: 0, due: today, seen: 0, right: 0, wrong: 0, updated: nowMs, notBefore: nowMs + MEET_MS };
}

export function grade(rec: Rec | undefined, right: boolean, mode: Mode, today: string, nowMs: number): Rec {
  const prev = rec ?? meet(nowMs, today);
  const r: Rec = { ...prev, seen: prev.seen + 1, right: prev.right + (right ? 1 : 0), wrong: prev.wrong + (right ? 0 : 1), updated: nowMs };
  if (mode === "note" && (right ? !isDue(rec, today, nowMs) : prev.box === 0)) return r;   // counters only
  if (right) { r.box = Math.min(prev.box + 1, MAX_BOX); r.due = addDays(today, INTERVALS[r.box]); delete r.notBefore; }
  else if (mode === "note") { r.box = Math.max(1, prev.box - 1); r.due = addDays(today, 1); }
  else { r.box = 0; r.due = today; r.notBefore = nowMs + RELEARN_MS; }
  return r;
}

export interface Session { due: Card[]; fresh: Card[]; /** earliest notBefore still in the future among cards due today by date; 0 = none */ waitUntil: number }

export function buildSession(
  deck: Card[], items: Record<string, Rec>, introducedToday: string[],
  today: string, nowMs: number, newPerDay: number, maxDue = 50,
): Session {
  const due = deck
    .filter((c) => isDue(items[c.id], today, nowMs))
    .sort((a, b) => {
      const da = items[a.id].due, db = items[b.id].due;
      return (da < db ? -1 : da > db ? 1 : 0) || a.unit - b.unit || a.order - b.order;
    })
    .slice(0, maxDue);
  const fresh = deck
    .filter((c) => !items[c.id])
    .sort((a, b) => a.unit - b.unit || a.order - b.order)
    .slice(0, Math.max(0, newPerDay - introducedToday.length));
  let waitUntil = 0;
  for (const c of deck) {
    const r = items[c.id];
    if (r && r.due <= today && (r.notBefore ?? 0) > nowMs && (!waitUntil || r.notBefore! < waitUntil)) waitUntil = r.notBefore!;
  }
  return { due, fresh, waitUntil };
}

export function isDone(s: Session): boolean {
  return s.due.length === 0 && s.fresh.length === 0 && s.waitUntil === 0;
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
