import { readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Rec } from "./schedule";

export type { Rec };

export interface Progress {
  version: 1;
  /** key = Card.id; presence = "introduced". */
  items: Record<string, Rec>;
  /** key = dayKey. */
  days: Record<string, { introduced: string[]; reviews: number }>;
  /** ms epoch; until 0 = none. */
  snooze: { until: number; at: number };
  /** dayKey or ""; paused iff until >= today. */
  pause: { until: string; at: number };
  /** The modal claim; owner = `${process.pid}-${random6}`. */
  prompt: { day: string; owner: string; at: number } | null;
}

export const EMPTY: Progress = {
  version: 1, items: {}, days: {},
  snooze: { until: 0, at: 0 }, pause: { until: "", at: 0 }, prompt: null,
};

const fresh = (): Progress => JSON.parse(JSON.stringify(EMPTY));

/** File wins on the claim; everything else is last-writer-wins per entry. */
export function mergeProgress(file: Progress, mem: Progress): Progress {
  const f = { ...fresh(), ...file };
  const items: Record<string, Rec> = { ...mem.items };
  for (const [k, r] of Object.entries(f.items)) {
    if (!items[k] || r.updated >= items[k].updated) items[k] = r;
  }
  const days: Progress["days"] = { ...mem.days };
  for (const [k, d] of Object.entries(f.days)) {
    const m = mem.days[k];
    days[k] = m
      ? { introduced: [...d.introduced, ...m.introduced.filter((id) => !d.introduced.includes(id))],
          reviews: Math.max(d.reviews, m.reviews) }
      : d;
  }
  return {
    version: 1, items, days,
    snooze: mem.snooze.at > f.snooze.at ? mem.snooze : f.snooze,
    pause: mem.pause.at > f.pause.at ? mem.pause : f.pause,
    prompt: f.prompt,
  };
}

// ponytail: read-merge-rename, no lockfile; add one if two windows ever grade the same card in the same millisecond
export class Store {
  state: Progress = fresh();
  constructor(readonly file: string) {}

  load(): Progress {
    let text: string;
    try { text = readFileSync(this.file, "utf8"); } catch { return this.state; }
    let parsed: Progress;
    try {
      parsed = JSON.parse(text);
    } catch {
      renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      return this.state;
    }
    this.state = mergeProgress(parsed, this.state);
    return this.state;
  }

  update(fn: (s: Progress) => void): Progress {
    this.load();
    fn(this.state);
    const tmp = `${this.file}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(this.state));
    renameSync(tmp, this.file);
    return this.state;
  }

  watch(onChange: () => void): () => void {
    const name = basename(this.file);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const w = watch(dirname(this.file), { persistent: false }, (_e, n) => {
      if (n !== name) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 150);
    });
    return () => { if (timer) clearTimeout(timer); w.close(); };
  }
}
