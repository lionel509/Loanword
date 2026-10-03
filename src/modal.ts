import { App, Modal } from "obsidian";
import type { Card } from "./deck";
import type { QueueItem } from "./drip";
import { renderCard, type Rendered, type Result } from "./quiz-ui";

/** One drip. Closing it by any route except finishing is a dismiss. */
export class ReviewModal extends Modal {
  private total = 0;
  private done = 0;
  private finished = false;
  private silenced = false;
  private ui: Rendered | null = null;

  constructor(
    app: App,
    private queue: QueueItem[],
    private onDone: (card: Card, r: Result) => void,
    private onFinish: () => void,
    private onDismiss: () => void,
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("loanword-modal");
    this.titleEl.setText("Loanword");
    this.total = this.queue.length;
    this.scope.register([], "1", () => { this.ui?.grade(false); return false; });
    this.scope.register([], "2", () => { this.ui?.grade(true); return false; });
    this.scope.register([], "Enter", () => { this.ui?.advance(); return false; });
    this.scope.register([], " ", () => { this.ui?.advance(); return false; });
    this.show();
  }

  private show() {
    const { contentEl } = this;
    contentEl.empty();
    const item = this.queue[0];
    if (!item) { this.finished = true; this.onFinish(); this.close(); return; }
    const bar = contentEl.createDiv({ cls: "loanword-progress" }).createDiv({ cls: "loanword-progress-bar" });
    bar.style.width = `${this.total ? (100 * this.done) / this.total : 0}%`;
    const body = contentEl.createDiv();
    this.ui = renderCard(body, item.card, item.kind, (r) => {
      this.queue.shift();
      this.done++;
      this.onDone(item.card, r);
      this.show();
    });
    const foot = contentEl.createDiv({ cls: "loanword-foot" });
    foot.createSpan({ cls: "loanword-hint", text: item.kind === "meet" ? "Enter: got it" : "Space to show · 1 missed · 2 knew it" });
    const later = foot.createEl("button", { cls: "loanword-snooze", text: "Later", attr: { type: "button" } });
    later.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
    if (!this.finished && !this.silenced) this.onDismiss();
  }

  closeSilently() {
    this.silenced = true;
    this.close();
  }
}
