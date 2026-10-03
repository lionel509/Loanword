import { App, Modal } from "obsidian";
import type { Card } from "./deck";
import { fnv1a } from "./hash";
import { makeQuestion } from "./question";
import { renderQuestion, type Rendered } from "./quiz-ui";

/** The daily review. Closing it by any route except finishing is a 1 h snooze. */
export class ReviewModal extends Modal {
  private graded = new Set<string>();
  private reviewed = 0;
  private introduced = 0;
  private finished = false;
  private silenced = false;
  private ui: Rendered | null = null;
  private total = 0;
  private learned = new Set<string>();

  constructor(
    app: App,
    private queue: Card[],
    private deck: Card[],
    private today: string,
    // ponytail: isNew added to the plan's signature so the summary can count "M new"
    private isNew: (card: Card) => boolean,
    private onAnswer: (card: Card, right: boolean) => void,
    private onFinish: () => void,
    private onSnooze: () => void,
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("loanword-modal");
    this.titleEl.setText("Loanword");
    this.total = this.queue.length;
    this.scope.register([], "1", () => { this.ui?.pick(0); return false; });
    this.scope.register([], "2", () => { this.ui?.pick(1); return false; });
    this.scope.register([], "3", () => { this.ui?.pick(2); return false; });
    this.scope.register([], "Enter", () => { this.ui?.next(); return false; });
    this.scope.register([], " ", () => { this.ui?.next(); return false; });
    this.show();
  }

  private show() {
    const { contentEl } = this;
    contentEl.empty();
    const card = this.queue[0];
    if (!card) return this.summary();
    const bar = contentEl.createDiv({ cls: "loanword-progress" }).createDiv({ cls: "loanword-progress-bar" });
    const setBar = () => { bar.style.width = `${this.total ? (100 * this.learned.size) / this.total : 0}%`; };
    setBar();
    const body = contentEl.createDiv();
    const q = makeQuestion(card, this.deck, fnv1a(card.id + "|" + this.today));
    this.ui = renderQuestion(body, q, (right) => {
      if (!this.graded.has(card.id)) {
        this.graded.add(card.id);
        if (this.isNew(card)) this.introduced++; else this.reviewed++;
        this.onAnswer(card, right);
      }
      if (right) { this.learned.add(card.id); setBar(); }
      this.queue.shift();
      if (!right) this.queue.push(card);   // re-asked until right; only the first answer grades
    }, () => this.show());
    const foot = contentEl.createDiv({ cls: "loanword-foot" });
    foot.createSpan({ cls: "loanword-hint", text: "1–3 to answer · Enter for next" });
    const snooze = foot.createEl("button", { cls: "loanword-snooze", text: "Snooze 1 h", attr: { type: "button" } });
    snooze.addEventListener("click", () => this.close());
  }

  private summary() {
    this.ui = null;
    const wrap = this.contentEl.createDiv({ cls: "loanword-quiz" });
    const done = wrap.createDiv({ cls: "loanword-done" });
    done.createDiv({ cls: "loanword-done-mark", text: "✓" });
    done.createDiv({ cls: "loanword-done-title", text: "Done for today" });
    done.createDiv({ cls: "loanword-done-stats", text: `${this.reviewed} reviewed · ${this.introduced} new · back tomorrow` });
    const close = wrap.createEl("button", { cls: "mod-cta loanword-next", text: "Close", attr: { type: "button" } });
    // ponytail: finished on reaching the summary, not on Close, so Esc here is not a snooze
    this.finished = true;
    this.onFinish();
    close.addEventListener("click", () => this.close());
    close.focus();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.finished && !this.silenced) this.onSnooze();
  }

  closeSilently() {
    this.silenced = true;
    this.close();
  }
}
