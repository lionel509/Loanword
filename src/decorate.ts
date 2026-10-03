import { StateEffect } from "@codemirror/state";
import {
  Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import type { Card } from "./deck";
import { pickSwaps, skipNode, visiblePicks, type Lexicon, type Pick } from "./pick";
import type { LoanwordSettings } from "./settings";

export const refreshSwaps = StateEffect.define<null>();

export interface SwapContext {
  lexicon(): Lexicon;
  settings(): LoanwordSettings;
  allowed(path: string): boolean;
  onClick(card: Card, rect: DOMRect): void;
}

class SwapWidget extends WidgetType {
  constructor(readonly card: Card, readonly onClick: (card: Card, rect: DOMRect) => void) { super(); }
  eq(other: SwapWidget) { return other.card.id === this.card.id; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "loanword-swap";
    span.textContent = this.card.form;
    span.lang = this.card.script === "zh" ? "zh-Hans" : "ko";
    span.dataset.id = this.card.id;
    // A plain click would move the cursor onto this line, which un-swaps the
    // word before the popover opens.
    span.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(this.card, span.getBoundingClientRect());
    };
    return span;
  }
  ignoreEvent() { return true; }
}

export function swapPlugin(ctx: SwapContext) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      picks: Pick[] | null = null;

      constructor(view: EditorView) { this.compute(view, true, true); }

      update(u: ViewUpdate) {
        const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshSwaps)));
        const redraw = refresh || u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged;
        if (redraw) this.compute(u.view, u.docChanged || refresh, false);
      }

      compute(view: EditorView, repick: boolean, first: boolean) {
        const state = view.state;
        const path = state.field(editorInfoField, false)?.file?.path;
        if (!state.field(editorLivePreviewField, false) || !path || !ctx.allowed(path)) {
          this.decorations = Decoration.none;
          this.picks = null;
          return;
        }
        if (repick || first || this.picks === null) {
          const s = ctx.settings();
          // ponytail: no swaps in huge notes; chunked scan if one matters
          this.picks = state.doc.length > 300_000
            ? []
            : pickSwaps(state.doc.toString(), ctx.lexicon(), path, s.swapEvery, s.maxSwapsPerNote);
        }
        const skip: [number, number][] = [];
        for (const { from, to } of view.visibleRanges) {
          syntaxTree(state).iterate({
            from, to,
            enter: (n) => { if (skipNode(n.type.name)) skip.push([n.from, n.to]); },
          });
        }
        for (const r of state.selection.ranges) {
          const line = state.doc.lineAt(r.head);
          skip.push([line.from, line.to], [r.from, r.to]);
        }
        const inView = (p: Pick) => view.visibleRanges.some((v) => p.from >= v.from && p.to <= v.to);
        this.decorations = Decoration.set(
          visiblePicks(this.picks, skip).filter(inView).map((p) =>
            Decoration.replace({ widget: new SwapWidget(p.card, ctx.onClick) }).range(p.from, p.to)),
          true,
        );
      }
    },
    { decorations: (v) => v.decorations },
  );
}
