import type { Card } from "./deck";
import type { Question } from "./question";

/** zh card → pinyin, then `ko (hanja)`; ko card → hanja, then `zh pinyin`. */
export function revealText(c: Card): string {
  const parts: string[] = [];
  if (c.script === "zh") {
    if (c.pinyin) parts.push(c.pinyin);
    if (c.ko) parts.push(c.hanja ? `${c.ko} (${c.hanja})` : c.ko);
  } else {
    if (c.hanja) parts.push(c.hanja);
    if (c.zh) parts.push(c.pinyin ? `${c.zh} ${c.pinyin}` : c.zh);
  }
  return parts.join(" · ");
}

export interface Rendered { pick(i: number): void; next(): void }

/** Shared by the modal and the popover. Nothing is revealed until a pick. */
export function renderQuestion(
  el: HTMLElement, q: Question, onAnswer: (right: boolean) => void, onNext: () => void,
): Rendered {
  el.empty();
  el.createDiv({ cls: "loanword-prompt", text: q.prompt, attr: { lang: q.card.script === "zh" ? "zh-Hans" : "ko" } });
  const opts = el.createDiv({ cls: "loanword-options" });
  let picked = false;
  let nextBtn: HTMLButtonElement | null = null;
  const buttons = q.options.map((o, i) => {
    const b = opts.createEl("button", { text: `${i + 1} ${o}` });
    b.addEventListener("click", () => pick(i));
    return b;
  });
  function pick(i: number) {
    if (picked || i < 0 || i >= buttons.length) return;
    picked = true;
    buttons.forEach((b) => (b.disabled = true));
    buttons[q.answer].addClass("is-right");
    if (i !== q.answer) buttons[i].addClass("is-wrong");
    onAnswer(i === q.answer);
    el.createDiv({ cls: "loanword-reveal", text: revealText(q.card) });
    nextBtn = el.createEl("button", { cls: "mod-cta", text: "Next" });
    nextBtn.addEventListener("click", () => onNext());
    nextBtn.focus();
  }
  return { pick, next: () => { if (picked) onNext(); } };
}

/** A small card next to a swapped word. Dismissing it grades nothing. */
export class QuizPopover {
  private el: HTMLElement | null = null;
  private ui: Rendered | null = null;
  private onDown = (e: MouseEvent) => { if (this.el && !this.el.contains(e.target as Node)) this.close(); };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); this.close(); }
    else if (/^[1-3]$/.test(e.key)) { e.preventDefault(); this.ui?.pick(Number(e.key) - 1); }
  };

  constructor(private anchor: DOMRect) {}

  open(q: Question, onAnswer: (right: boolean) => void) {
    const el = (this.el = document.body.createDiv({ cls: "loanword-pop" }));
    this.ui = renderQuestion(el, q, onAnswer, () => this.close());
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(this.anchor.left, window.innerWidth - r.width - 4));
    let top = this.anchor.bottom + 4;
    if (top + r.height > window.innerHeight - 4) top = Math.max(4, this.anchor.top - r.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    document.addEventListener("mousedown", this.onDown, true);
    document.addEventListener("keydown", this.onKey, true);
  }

  close() {
    document.removeEventListener("mousedown", this.onDown, true);
    document.removeEventListener("keydown", this.onKey, true);
    this.el?.remove();
    this.el = null;
  }
}
