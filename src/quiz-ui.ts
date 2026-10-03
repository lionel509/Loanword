import type { Card } from "./deck";
import { displayMeaning, type Question } from "./question";

export interface Rendered { pick(i: number): void; next(): void }

const langOf = (script: Card["script"]) => (script === "zh" ? "zh-Hans" : "ko");

/** Reading, the other language's half of the row, then the full meaning. */
function renderReveal(el: HTMLElement, c: Card) {
  const box = el.createDiv({ cls: "loanword-reveal" });
  if (c.reading) box.createDiv({ cls: "loanword-reading", text: c.reading, attr: { lang: langOf(c.script) } });
  if (c.script === "zh" && c.ko) {
    const o = box.createDiv({ cls: "loanword-other" });
    o.createSpan({ cls: "loanword-other-label", text: "Korean" });
    o.createSpan({ text: c.ko, attr: { lang: "ko" } });
    if (c.hanja) o.appendText(` (${c.hanja})`);
  } else if (c.script === "ko" && c.zh) {
    const o = box.createDiv({ cls: "loanword-other" });
    o.createSpan({ cls: "loanword-other-label", text: "Chinese" });
    o.createSpan({ text: c.zh, attr: { lang: "zh-Hans" } });
    if (c.pinyin) o.appendText(` ${c.pinyin}`);
  }
  box.createDiv({ cls: "loanword-meaning", text: c.meaning });
}

/** Shared by the modal and the popover. Nothing is revealed until a pick. */
export function renderQuestion(
  el: HTMLElement, q: Question, onAnswer: (right: boolean) => void, onNext: () => void,
): Rendered {
  el.empty();
  el.addClass("loanword-quiz");
  el.dataset.state = "ask";
  const card = el.createDiv({ cls: "loanword-card" });
  card.createDiv({ cls: "loanword-lang", text: q.card.script === "zh" ? "Chinese" : "Korean" });
  card.createDiv({ cls: "loanword-prompt", text: q.prompt, attr: { lang: langOf(q.card.script) } });
  const opts = el.createDiv({ cls: "loanword-options" });
  let picked = false;
  const buttons = q.options.map((o, i) => {
    const b = opts.createEl("button", { cls: "loanword-option", attr: { type: "button" } });
    b.createSpan({ cls: "loanword-key", text: String(i + 1) });
    b.createSpan({ cls: "loanword-label", text: displayMeaning(o) });
    b.createSpan({ cls: "loanword-mark", text: "" });
    b.addEventListener("click", () => pick(i));
    return b;
  });
  const mark = (b: HTMLButtonElement, t: string) => b.querySelector(".loanword-mark")?.setText(t);
  function pick(i: number) {
    if (picked || i < 0 || i >= buttons.length) return;
    picked = true;
    // Never `disabled`: it greys the buttons and hides the right/wrong colours.
    el.dataset.state = "answered";
    buttons.forEach((b, j) => {
      if (j === q.answer) { b.addClass("is-right"); mark(b, "✓"); }
      else if (j === i) { b.addClass("is-wrong"); mark(b, "✗"); }
      else b.addClass("is-dim");
    });
    onAnswer(i === q.answer);
    renderReveal(el, q.card);
    const nextBtn = el.createEl("button", { cls: "mod-cta loanword-next", text: "Next", attr: { type: "button" } });
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
    this.ui = renderQuestion(el.createDiv(), q, onAnswer, () => this.close());
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
