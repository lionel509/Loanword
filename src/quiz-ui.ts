/*
DOM contract (stable class names):
.loanword-quiz[data-kind="recall"|"meet"][data-state="ask"|"right"|"wrong"|"dontknow"|"meet"]
  .loanword-card > .loanword-lang ("Chinese" | "Korean" | "New · Chinese" | "New · Korean") · .loanword-prompt[lang]
  ask:      input.loanword-answer[type=text][placeholder="Type the meaning"][autocomplete=off][spellcheck=false]
            .loanword-actions > button.loanword-option.loanword-dontknow "Don't know" · button.mod-cta.loanword-next "Check"
  right | wrong | dontknow:
            .loanword-verdict[data-verdict] "✓ Right" | "✗ You typed “<typed>”" | "The answer"
            .loanword-reveal (renderReveal, unchanged)
            wrong only: button.loanword-override "I was right"
            button.mod-cta.loanword-next "Next"
  meet:     .loanword-reveal · button.mod-cta.loanword-next "Got it"
Modal only: .loanword-progress > .loanword-progress-bar; .loanword-foot > .loanword-hint + button.loanword-snooze "Later".
Popover: .loanword-pop > div (the .loanword-quiz root), recall only.
*/
import type { Card } from "./deck";
import type { Kind } from "./drip";
import { checkAnswer } from "./answer";

export type Result = "miss" | "know" | "met";
export type State = "ask" | "right" | "wrong" | "dontknow" | "meet";
export interface Rendered { enter(): void; pending(): Result | null }

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

/** Shared by the modal and the popover. Never focuses a button, only the input. */
export function renderCard(
  el: HTMLElement, card: Card, kind: Kind, onDone: (r: Result) => void, onLayout?: (state: State) => void,
): Rendered {
  let state: State = kind === "meet" ? "meet" : "ask";
  let pending: Result | null = null;
  let typed = "";
  let input: HTMLInputElement | null = null;
  const finish = (r: Result) => { pending = null; onDone(r); };
  const submit = (v: string) => {
    const t = v.trim();
    if (!t) { state = "dontknow"; pending = "miss"; }
    else if (checkAnswer(t, card.meaning)) { state = "right"; pending = "know"; }
    else { state = "wrong"; pending = "miss"; typed = t; }
    draw();
  };
  const enter = () => {
    if (state === "ask") submit(input?.value ?? "");
    else if (state === "meet") finish("met");
    else if (pending) finish(pending);
  };
  function draw() {
    el.empty();
    el.addClass("loanword-quiz");
    el.dataset.kind = kind;
    el.dataset.state = state;
    const lang = card.script === "zh" ? "Chinese" : "Korean";
    const c = el.createDiv({ cls: "loanword-card" });
    c.createDiv({ cls: "loanword-lang", text: kind === "meet" ? `New · ${lang}` : lang });
    c.createDiv({ cls: "loanword-prompt", text: card.form, attr: { lang: langOf(card.script) } });
    input = null;
    if (state === "ask") {
      const inp = (input = el.createEl("input", {
        cls: "loanword-answer",
        attr: { type: "text", placeholder: "Type the meaning", autocomplete: "off", spellcheck: "false" },
      }));
      const acts = el.createDiv({ cls: "loanword-actions" });
      acts.createEl("button", { cls: "loanword-option loanword-dontknow", text: "Don't know", attr: { type: "button" } })
        .addEventListener("click", () => submit(""));
      acts.createEl("button", { cls: "mod-cta loanword-next", text: "Check", attr: { type: "button" } })
        .addEventListener("click", () => enter());
      window.setTimeout(() => inp.focus(), 0);
    } else if (state === "meet") {
      renderReveal(el, card);
      el.createEl("button", { cls: "mod-cta loanword-next", text: "Got it", attr: { type: "button" } })
        .addEventListener("click", () => enter());
    } else {
      const text = state === "right" ? "✓ Right" : state === "wrong" ? `✗ You typed “${typed}”` : "The answer";
      el.createDiv({ cls: "loanword-verdict", text, attr: { "data-verdict": state } });
      renderReveal(el, card);
      if (state === "wrong") {
        el.createEl("button", { cls: "loanword-override", text: "I was right", attr: { type: "button" } })
          .addEventListener("click", () => { pending = "know"; enter(); });
      }
      el.createEl("button", { cls: "mod-cta loanword-next", text: "Next", attr: { type: "button" } })
        .addEventListener("click", () => enter());
    }
    onLayout?.(state);
  }
  draw();
  return { enter, pending: () => pending };
}

/** A small card next to a swapped word. Dismissing it after a check commits that grade. */
export class QuizPopover {
  static current: QuizPopover | null = null;
  private el: HTMLElement | null = null;
  private ui: Rendered | null = null;
  private onDone: ((r: Result) => void) | null = null;
  private prevFocus: HTMLElement | null = null;
  private onDown = (e: MouseEvent) => { if (this.el && !this.el.contains(e.target as Node)) this.close(); };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); this.close(); }
    else if (e.key === "Enter" && !e.isComposing && this.el?.contains(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      this.ui?.enter();
    }
  };

  constructor(private anchor: DOMRect) {}

  open(card: Card, onDone: (r: Result) => void) {
    QuizPopover.current?.close();
    QuizPopover.current = this;
    this.onDone = onDone;
    this.prevFocus = document.activeElement as HTMLElement | null;
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
    const p = this.ui?.pending();
    const done = this.onDone;
    this.ui = null;
    this.onDone = null;
    if (p && done) done(p);
    document.removeEventListener("mousedown", this.onDown, true);
    document.removeEventListener("keydown", this.onKey, true);
    this.el?.remove();
    this.el = null;
    if (QuizPopover.current === this) QuizPopover.current = null;
    this.prevFocus?.focus();
  }
}
