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
    this.titleEl.setText(`Loanword — ${this.queue.length} left`);
    const body = contentEl.createDiv();
    const q = makeQuestion(card, this.deck, fnv1a(card.id + "|" + this.today));
    this.ui = renderQuestion(body, q, (right) => {
      if (!this.graded.has(card.id)) {
        this.graded.add(card.id);
        if (this.isNew(card)) this.introduced++; else this.reviewed++;
        this.onAnswer(card, right);
      }
      this.queue.shift();
      if (!right) this.queue.push(card);   // re-asked until right; only the first answer grades
    }, () => this.show());
    const snooze = contentEl.createEl("button", { text: "Snooze 1 h" });
    snooze.addEventListener("click", () => this.close());
  }

  private summary() {
    this.ui = null;
    this.titleEl.setText("Loanword");
    this.contentEl.createEl("p", { text: `Done. ${this.reviewed} reviewed, ${this.introduced} new. Back tomorrow.` });
    const close = this.contentEl.createEl("button", { cls: "mod-cta", text: "Close" });
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
