import { App, Modal } from "obsidian";
import type { Card } from "./deck";
import type { QueueItem } from "./drip";
import { renderCard, type Rendered, type Result, type State } from "./quiz-ui";

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
    this.scope.register([], "Enter", (e) => { if (!e.repeat) this.ui?.enter(); return false; });
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
    let hint: HTMLElement | null = null;
    const setHint = (st: State) => {
      hint?.setText(st === "ask" ? "Type the meaning · Enter to check · empty Enter = don't know" : st === "meet" ? "Enter: got it" : "Enter: next");
    };
    this.ui = renderCard(body, item.card, item.kind, (r) => {
      this.queue.shift();
      this.done++;
      this.onDone(item.card, r);
      this.show();
    }, setHint);
    const foot = contentEl.createDiv({ cls: "loanword-foot" });
    hint = foot.createSpan({ cls: "loanword-hint" });
    // ponytail: renderCard's first onLayout runs before the foot exists, so set the initial hint here
    setHint(item.kind === "meet" ? "meet" : "ask");
    const later = foot.createEl("button", { cls: "loanword-snooze", text: "Later", attr: { type: "button" } });
    later.addEventListener("click", () => this.close());
  }

  onClose() {
    const p = this.ui?.pending();
    if (p && this.queue[0]) this.onDone(this.queue[0].card, p);
    this.contentEl.empty();
    if (!this.finished && !this.silenced) this.onDismiss();
  }

  closeSilently() {
    this.silenced = true;
    this.close();
  }
}
