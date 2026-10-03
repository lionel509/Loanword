import { ItemView, WorkspaceLeaf } from "obsidian";
import type { Card } from "./deck";
import { nextLabel } from "./drip";
import { buildSession, isDone, tally } from "./schedule";
import type { LoanwordSettings } from "./settings";
import type { Progress } from "./store";

export const VIEW_TYPE = "loanword-progress";

export interface ViewActions {
  review(): void;
  pause(days: number): void;
  resume(): void;
}

export class ProgressView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private actions: ViewActions, private refresh: () => void) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Loanword"; }
  getIcon() { return "languages"; }

  async onOpen() { this.refresh(); }

  render(deck: Card[], progress: Progress | null, settings: LoanwordSettings, today: string, nowMs: number) {
    const el = this.contentEl;
    el.empty();
    el.addClass("loanword-view");
    const p = progress;
    const day = p?.days[today];
    const introducedToday = day?.introduced ?? [];
    const s = buildSession(deck, p?.items ?? {}, introducedToday, today, nowMs, settings.newPerDay);
    const paused = !!p && p.pause.until >= today;
    el.createEl("p", {
      text: `Today: ${s.due.length} due · ${introducedToday.length}/${settings.newPerDay} new · ${day?.reviews ?? 0} reviewed`
        + (p && !paused && !isDone(s) ? ` · ${nextLabel(s, p.drip.next, nowMs)}` : ""),
    });

    const bar = el.createDiv({ cls: "loanword-buttons" });
    const review = bar.createEl("button", { cls: "mod-cta", text: "Review now" });
    review.disabled = !p || isDone(s);
    review.addEventListener("click", () => this.actions.review());
    if (paused) {
      bar.createEl("button", { text: "Resume" }).addEventListener("click", () => this.actions.resume());
    } else {
      for (const [label, days] of [["Pause today", 1], ["3 days", 3], ["7 days", 7]] as const) {
        bar.createEl("button", { text: label }).addEventListener("click", () => this.actions.pause(days));
      }
    }

    const table = el.createEl("table", { cls: "loanword-table" });
    const head = table.createEl("tr");
    for (const h of ["Unit", "new", "learning", "known"]) head.createEl("th", { text: h });
    const t = tally(deck, p?.items ?? {});
    for (const unit of [...t.keys()].sort((a, b) => a - b)) {
      const r = t.get(unit)!;
      const row = table.createEl("tr");
      for (const v of [unit, r.fresh, r.learning, r.known]) row.createEl("td", { text: String(v) });
    }

    el.createEl("p", {
      cls: "loanword-footer",
      text: settings.deckPath ? settings.deckPath : "No deck — set it in Settings → Loanword",
    });
  }
}
