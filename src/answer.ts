const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().replace(/^(to|the|a|an) /, "");
const stem = (s: string) => s.replace(/(es|s)$/, "");

/** Accepted answers: parentheticals removed first, then split on , ; / */
export function alternatives(meaning: string): string[] {
  return meaning.replace(/\([^)]*\)/g, " ").split(/[,;/]/).map(norm).filter(Boolean);
}

/** Optimal-string-alignment distance <= 1 (one insert, delete, substitute, or adjacent swap). */
export function withinOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  const ra = a.slice(i + 1), rb = b.slice(i + 1);
  if (a.length === b.length) return ra === rb || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === rb;
}

export function checkAnswer(typed: string, meaning: string): boolean {
  const t = norm(typed);
  if (!t) return false;
  return alternatives(meaning).some((m) => t === m || stem(t) === stem(m) || (m.length >= 5 && withinOne(t, m)));
}
