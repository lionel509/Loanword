/*
DOM contract (stable class names):
.loanword-quiz[data-kind="recall"|"meet"][data-state="ask"|"reveal"|"meet"]
  .loanword-card
    .loanword-lang       "Chinese" | "Korean" | "New · Chinese" | "New · Korean"
    .loanword-prompt     the form, attr lang="zh-Hans"|"ko"
    .loanword-hint       (ask only) "Say the meaning, then show the answer"
  .loanword-reveal       (reveal and meet) .loanword-reading / .loanword-other / .loanword-meaning  — renderReveal unchanged
  .loanword-options      (reveal only)
    button.loanword-option.loanword-grade[data-grade="miss"] > .loanword-key "1" · .loanword-mark "✗" · .loanword-label "Missed"
    button.loanword-option.loanword-grade[data-grade="know"] > .loanword-key "2" · .loanword-mark "✓" · .loanword-label "Knew it"
  button.mod-cta.loanword-next   text "Show answer" (ask) | "Got it" (meet) | absent (reveal)
Modal only: .loanword-progress > .loanword-progress-bar above; .loanword-foot > .loanword-hint + button.loanword-snooze "Later" below.
Popover: .loanword-pop > div (the .loanword-quiz root), recall kind only.
*/
import type { Card } from "./deck";
import type { Kind } from "./drip";

export type Result = "miss" | "know" | "met";
export interface Rendered { advance(): void; grade(right: boolean): void }

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

/** Shared by the modal and the popover. Never focuses a button: the scope key would double-fire. */
export function renderCard(
  el: HTMLElement, card: Card, kind: Kind, onDone: (r: Result) => void, onLayout?: () => void,
): Rendered {
  let state: "ask" | "reveal" | "meet" = kind === "meet" ? "meet" : "ask";
  const advance = () => {
    if (state === "ask") { state = "reveal"; draw(); }
    else if (state === "meet") onDone("met");
  };
  const grade = (right: boolean) => { if (state === "reveal") onDone(right ? "know" : "miss"); };
  function draw() {
    el.empty();
    el.addClass("loanword-quiz");
    el.dataset.kind = kind;
    el.dataset.state = state;
    const lang = card.script === "zh" ? "Chinese" : "Korean";
    const c = el.createDiv({ cls: "loanword-card" });
    c.createDiv({ cls: "loanword-lang", text: kind === "meet" ? `New · ${lang}` : lang });
    c.createDiv({ cls: "loanword-prompt", text: card.form, attr: { lang: langOf(card.script) } });
    if (state === "ask") c.createDiv({ cls: "loanword-hint", text: "Say the meaning, then show the answer" });
    if (state !== "ask") renderReveal(el, card);
    if (state === "reveal") {
      const opts = el.createDiv({ cls: "loanword-options" });
      for (const [g, key, mark, label] of [["miss", "1", "✗", "Missed"], ["know", "2", "✓", "Knew it"]] as const) {
        const b = opts.createEl("button", { cls: "loanword-option loanword-grade", attr: { type: "button", "data-grade": g } });
        b.createSpan({ cls: "loanword-key", text: key });
        b.createSpan({ cls: "loanword-mark", text: mark });
        b.createSpan({ cls: "loanword-label", text: label });
        b.addEventListener("click", () => grade(g === "know"));
      }
    } else {
      const next = el.createEl("button", { cls: "mod-cta loanword-next", text: state === "ask" ? "Show answer" : "Got it", attr: { type: "button" } });
      next.addEventListener("click", () => advance());
    }
    onLayout?.();
  }
  draw();
  return { advance, grade };
}

/** A small card next to a swapped word. Dismissing it grades nothing. */
export class QuizPopover {
  private el: HTMLElement | null = null;
  private ui: Rendered | null = null;
  private onDown = (e: MouseEvent) => { if (this.el && !this.el.contains(e.target as Node)) this.close(); };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); this.close(); }
    else if (e.key === "1" || e.key === "2") { e.preventDefault(); this.ui?.grade(e.key === "2"); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.ui?.advance(); }
  };

  constructor(private anchor: DOMRect) {}

  open(card: Card, onDone: (r: Result) => void) {
    const el = (this.el = document.body.createDiv({ cls: "loanword-pop" }));
    this.ui = renderCard(el.createDiv(), card, "recall", (r) => { onDone(r); this.close(); }, () => this.place());
    this.place();
    document.addEventListener("mousedown", this.onDown, true);
    document.addEventListener("keydown", this.onKey, true);
  }

  private place() {
    const el = this.el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(this.anchor.left, window.innerWidth - r.width - 4));
    let top = this.anchor.bottom + 4;
    if (top + r.height > window.innerHeight - 4) top = Math.max(4, this.anchor.top - r.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  close() {
    document.removeEventListener("mousedown", this.onDown, true);
    document.removeEventListener("keydown", this.onKey, true);
    this.el?.remove();
    this.el = null;
  }
}
