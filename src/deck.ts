/** One review item. A row with both zh and ko yields two. */
export interface Card {
  /** `${script}:${form}` — stable across row reorder/insert; duplicates: first wins. */
  id: string;
  script: "zh" | "ko";
  /** 水 or 물 — what is shown. */
  form: string;
  /** zh → pinyin; ko → hanja ("" if none). */
  reading: string;
  zh: string; pinyin: string; ko: string; hanja: string;
  meaning: string;
  /** Lowercase single tokens; [] = review-only. */
  swap: string[];
  unit: number;
  /** Position after sorting (unit, note name, row), for tie-breaks. */
  order: number;
}

export const HEADER = ["zh", "pinyin", "ko", "hanja", "meaning", "swap"];

export interface DeckNote { name: string; text: string }

export function splitRow(line: string): string[] | null {
  let s = line.trim();
  if (!s.startsWith("|")) return null;
  s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  // ponytail: no \| escapes; the deck has none
  return s.split("|").map((c) => c.trim());
}

type RawCard = Omit<Card, "order"> & { row: number };

function parseRows(text: string, fallbackUnit: number): RawCard[] {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const um = fm ? /^unit:\s*(\d+)/m.exec(fm[1]) : null;
  const unit = um ? Number(um[1]) : fallbackUnit;
  const lines = text.split("\n");
  const out: RawCard[] = [];
  let i = lines.findIndex((l) => {
    const c = splitRow(l);
    return !!c && c.length === HEADER.length && c.every((x, j) => x.toLowerCase() === HEADER[j]);
  });
  if (i < 0 || !/^\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) return out;
  for (i += 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (!cells) break;
    if (cells.length < 5) continue;
    while (cells.length < 6) cells.push("");
    const [zh, pinyin, ko, hanja, meaning, swapCell] = cells;
    if (!meaning || (!zh && !ko)) continue;
    const swap = swapCell.split(",").map((w) => w.trim().toLowerCase()).filter((w) => w && !/\s/.test(w));
    const base = { zh, pinyin, ko, hanja, meaning, swap, unit, row: i };
    if (zh) out.push({ ...base, id: `zh:${zh}`, script: "zh", form: zh, reading: pinyin });
    if (ko) out.push({ ...base, id: `ko:${ko}`, script: "ko", form: ko, reading: hanja });
  }
  return out;
}

const strip = ({ row: _row, ...c }: RawCard, order: number): Card => ({ ...c, order });

export function parseDeckNote(text: string, fallbackUnit: number): Card[] {
  try {
    return parseRows(text, fallbackUnit).map(strip);
  } catch {
    return [];
  }
}

export function parseDeck(notes: DeckNote[]): Card[] {
  const all: { note: string; c: RawCard }[] = [];
  for (const n of notes) {
    let rows: RawCard[] = [];
    try { rows = parseRows(n.text, 0); } catch { rows = []; }
    for (const c of rows) all.push({ note: n.name, c });
  }
  all.sort((a, b) =>
    a.c.unit - b.c.unit || (a.note < b.note ? -1 : a.note > b.note ? 1 : 0) || a.c.row - b.c.row);
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const { c } of all) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(strip(c, out.length));
  }
  return out;
}
