import {
  App, FileSystemAdapter, MarkdownView, Notice, Plugin, PluginSettingTab, Setting,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { mkdirSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { parseDeck, type Card } from "./deck";
import { refreshSwaps, swapPlugin } from "./decorate";
import { nextDripAt, nextLabel, pickDrip, shouldFire } from "./drip";
import { ReviewModal } from "./modal";
import { buildLexicon, type Lexicon } from "./pick";
import { QuizPopover } from "./quiz-ui";
import { addDays, buildSession, dayKey, grade, isDone, meet, type Mode, type Session } from "./schedule";
import { DEFAULT_SETTINGS, forbiddenPath, isExcluded, type LoanwordSettings } from "./settings";
import { Store } from "./store";
import { ProgressView, VIEW_TYPE } from "./view";

const CLAIM_TTL = 90_000;
const HEARTBEAT = 30_000;
const DISMISS_MS = 15 * 60e3;
const TICK_MS = 5_000;

export default class LoanwordPlugin extends Plugin {
  cfg: LoanwordSettings = { ...DEFAULT_SETTINGS };
  readonly instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  store: Store | null = null;
  deck: Card[] = [];
  lexicon: Lexicon = {};
  private statusEl!: HTMLElement;
  private modal: ReviewModal | null = null;
  private heartbeat: number | null = null;
  private stopStore: (() => void) | null = null;
  private deckWatcher: FSWatcher | null = null;
  private deckTimer: number | null = null;
  private warnedNoDeck = false;
  private unloaded = false;
  private lastKeyAt = 0;

  async onload() {
    this.cfg = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new LoanwordSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new ProgressView(leaf, {
      review: () => void this.reviewNow(false),
      pause: (d) => this.pause(d),
      resume: () => this.resume(),
    }, () => this.refreshAll()));
    this.addRibbonIcon("languages", "Loanword progress", () => void this.openSidebar());
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("loanword-status");
    this.registerDomEvent(this.statusEl, "click", () => {
      if (this.store) void this.reviewNow(true);
      else void this.openSidebar();
    });

    this.addCommand({ id: "review-now", name: "Review now", callback: () => void this.reviewNow(false) });
    this.addCommand({ id: "open-progress", name: "Open progress", callback: () => void this.openSidebar() });
    this.addCommand({ id: "pause-today", name: "Pause for today", callback: () => this.pause(1) });
    this.addCommand({ id: "pause-7-days", name: "Pause for 7 days", callback: () => this.pause(7) });
    this.addCommand({ id: "resume", name: "Resume", callback: () => this.resume() });
    this.addCommand({
      id: "toggle-swaps-here", name: "Toggle swaps in this vault",
      callback: async () => {
        this.cfg.swapsEnabled = !this.cfg.swapsEnabled;
        await this.saveSettings();
        new Notice(`Loanword swaps ${this.cfg.swapsEnabled ? "on" : "off"} in this vault`);
      },
    });
    this.addCommand({ id: "reload-deck", name: "Reload deck", callback: () => { this.loadDeck(); this.refreshAll(); } });
    this.addCommand({
      id: "log-syntax-nodes", name: "Log syntax nodes on the cursor line",
      editorCallback: (editor) => {
        // ponytail: editor.cm is undocumented; this is a dev command
        const cm = (editor as unknown as { cm?: EditorView }).cm;
        if (!cm) return;
        const line = cm.state.doc.lineAt(cm.state.selection.main.head);
        let n = 0;
        syntaxTree(cm.state).iterate({
          from: line.from, to: line.to,
          enter: (node) => { n++; console.log(node.type.name, JSON.stringify(cm.state.doc.sliceString(node.from, node.to))); },
        });
        new Notice(`Loanword: ${n} syntax nodes logged to the console`);
      },
    });

    this.registerEditorExtension([swapPlugin({
      lexicon: () => this.lexicon,
      settings: () => this.cfg,
      allowed: (path) => this.allowed(path),
      onClick: (card, rect) => {
        new QuizPopover(rect).open(card, (r) => this.onAnswer(card, r === "know", "note"));
      },
    })]);

    this.registerDomEvent(window, "focus", () => { this.lastKeyAt = Date.now(); this.onStoreChange(); });
    this.registerDomEvent(document, "keydown", () => { this.lastKeyAt = Date.now(); }, true);
    this.registerInterval(window.setInterval(() => this.tick(), TICK_MS));
    this.registerInterval(window.setInterval(() => this.onStoreChange(), 60_000));
    this.app.workspace.onLayoutReady(() => this.boot());
  }

  onunload() {
    this.unloaded = true;
    this.stopWatchers();
    this.clearTimers();
    this.modal?.closeSilently();
    this.releaseClaim();
  }

  today() { return dayKey(Date.now()); }

  session(): Session {
    const s = this.store?.state;
    const today = this.today();
    return buildSession(this.deck, s?.items ?? {}, s?.days[today]?.introduced ?? [], today, Date.now(), this.cfg.newPerDay);
  }

  paused(): boolean {
    return !!this.store && this.store.state.pause.until >= this.today();
  }

  // ---- wiring ---------------------------------------------------------------

  boot() {
    this.stopWatchers();
    this.store = null;
    this.deck = [];
    const dir = this.cfg.deckPath;
    if (forbiddenPath(dir)) {
      new Notice("Loanword: that deck path is off-limits");
      this.refreshAll();
      return;
    }
    let ok = false;
    try { ok = !!dir && isAbsolute(dir) && statSync(dir).isDirectory(); } catch { ok = false; }
    if (!ok) {
      if (dir && !this.warnedNoDeck) new Notice(`Loanword: deck folder not found — ${dir}`);
      this.warnedNoDeck = true;
      this.refreshAll();
      return;
    }
    this.loadDeck();
    if (!this.deck.length) { this.refreshAll(); return; }   // no cards: create nothing
    mkdirSync(join(dir, ".loanword"), { recursive: true });
    this.store = new Store(join(dir, ".loanword", "progress.json"));
    this.store.load();
    this.armFirstDrip();
    this.stopStore = this.store.watch(() => this.onStoreChange());
    this.deckWatcher = watch(dir, { persistent: false }, (_e, name) => {
      if (!name || !String(name).endsWith(".md")) return;   // A2: ignore .loanword/ writes
      if (this.deckTimer !== null) window.clearTimeout(this.deckTimer);
      this.deckTimer = window.setTimeout(() => { this.loadDeck(); this.refreshAll(); }, 500);
    });
    this.refreshAll();
  }

  private stopWatchers() {
    this.stopStore?.();
    this.stopStore = null;
    this.deckWatcher?.close();
    this.deckWatcher = null;
  }

  private clearTimers() {
    for (const t of [this.heartbeat]) if (t !== null) window.clearInterval(t);
    for (const t of [this.deckTimer]) if (t !== null) window.clearTimeout(t);
    this.heartbeat = this.deckTimer = null;
  }

  loadDeck() {
    const dir = this.cfg.deckPath;
    try {
      const notes = readdirSync(dir).filter((n) => n.endsWith(".md"))
        .map((n) => ({ name: n, text: readFileSync(join(dir, n), "utf8") }));
      this.deck = parseDeck(notes);
    } catch {
      this.deck = [];
    }
    this.rebuildLexicon();
  }

  private rebuildLexicon() {
    const items = this.store?.state.items ?? {};
    this.lexicon = buildLexicon(this.deck, (id) => !!items[id], this.cfg.swapScript);
  }

  allowed(path: string): boolean {
    if (!this.cfg.swapsEnabled || !this.store || this.paused()) return false;
    if (isExcluded(path, this.cfg.excludedFolders)) return false;
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      const rel = relative(adapter.getBasePath(), this.cfg.deckPath);
      if (rel && !rel.startsWith("..") && !isAbsolute(rel) && isExcluded(path, [rel])) return false;
    }
    return true;
  }

  // ---- drips -----------------------------------------------------

  private armFirstDrip() {
    const now = Date.now(), first = now + this.cfg.firstDripMinutes * 60e3;
    this.store?.update((s) => { if (s.drip.next < first) s.drip = { next: first, at: now }; });
  }

  private tick() {
    const s = this.store?.state;
    if (!s || this.modal || Date.now() < s.drip.next) return;
    if (!document.hasFocus() || Date.now() - this.lastKeyAt < this.cfg.idleSeconds * 1000 || this.paused() || QuizPopover.current) return;
    void this.maybePrompt(false);
  }

  /** Resolves to a Notice-ready reason when the review did not open, else null. */
  async maybePrompt(force: boolean): Promise<string | null> {
    const store = this.store;
    if (!store || !this.deck.length || this.modal) return null;
    store.load();
    const now = Date.now(), today = this.today();
    const claimedElsewhere = () => {
      const p = store.state.prompt;
      return !!p && p.day === today && p.owner !== this.instanceId && Date.now() - p.at < CLAIM_TTL;
    };
    const paused = this.paused(), session = this.session(), done = isDone(session);
    if (paused) return `Loanword: paused until ${store.state.pause.until}`;
    if (done) return "Loanword: done for today ✓";
    if (!force && !shouldFire({ focused: document.hasFocus(), lastKeyAt: this.lastKeyAt, paused, done, claimFree: !claimedElsewhere(), nextAt: store.state.drip.next }, now, this.cfg.idleSeconds)) return null;
    if (claimedElsewhere()) return "Loanword: review is open in another window";
    if (!force) await new Promise((r) => window.setTimeout(r, Math.random() * 1500));
    if (this.unloaded || !this.store || this.modal) return null;
    if (!force && (!document.hasFocus() || Date.now() - this.lastKeyAt < this.cfg.idleSeconds * 1000 || QuizPopover.current)) return null;
    // Compare-and-set (R4): re-check inside the claiming write; the file's claim wins.
    let allowed = false;
    store.update((st) => {
      allowed = force || (st.drip.next <= Date.now() && !(st.pause.until >= today));
      if (allowed && !claimedElsewhere()) st.prompt = { day: today, owner: this.instanceId, at: Date.now() };
    });
    if (!allowed) return null;
    if (store.state.prompt?.owner !== this.instanceId) return "Loanword: review is open in another window";

    const fresh = this.session();
    const queue = pickDrip(fresh, force ? Infinity : this.cfg.cardsPerDrip);
    if (!queue.length) {
      this.releaseClaim();
      if (!force) this.rearm(fresh.waitUntil || nextDripAt(Date.now(), this.cfg.dripMin, this.cfg.dripMax, Math.random()));
      return fresh.waitUntil ? `Loanword: next card in ~${Math.ceil((fresh.waitUntil - Date.now()) / 60e3)} min` : "Loanword: done for today ✓";
    }
    this.modal = new ReviewModal(
      this.app, queue,
      (card, r) => r === "met" ? this.onMeet(card) : this.onAnswer(card, r === "know", "review"),
      () => this.onFinish(),
      () => this.onDismiss(),
    );
    this.heartbeat = window.setInterval(() => {
      store.update((st) => { if (st.prompt?.owner === this.instanceId) { st.prompt.at = Date.now(); st.prompt.day = this.today(); } });
    }, HEARTBEAT);
    QuizPopover.current?.close();
    this.modal.open();
    return null;
  }

  private rearm(next: number) { this.store?.update((s) => { s.drip = { next, at: Date.now() }; }); }

  /** "Review now" from a command, the sidebar or the status bar: say why when it cannot open. */
  async reviewNow(fromStatusBar: boolean) {
    const why = await this.maybePrompt(true);
    if (!why) return;
    new Notice(why);
    if (fromStatusBar) void this.openSidebar();
  }

  onAnswer(card: Card, right: boolean, mode: Mode) {
    if (!this.store) return;
    const today = this.today();
    this.store.update((s) => {
      const had = !!s.items[card.id];
      s.items[card.id] = grade(s.items[card.id], right, mode, today, Date.now());
      const d = (s.days[today] ??= { introduced: [], reviews: 0 });
      if (!had) d.introduced.push(card.id);
      d.reviews++;
    });
    this.refreshAll();
  }

  onMeet(card: Card) {
    if (!this.store) return;
    const today = this.today(), now = Date.now();
    this.store.update((s) => {
      if (s.items[card.id]) return;
      s.items[card.id] = meet(now, today);
      (s.days[today] ??= { introduced: [], reviews: 0 }).introduced.push(card.id);
    });
    this.refreshAll();
  }

  private endModal() {
    this.modal = null;
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  onFinish() {
    this.endModal();
    this.store?.update((s) => {
      if (s.prompt?.owner === this.instanceId) s.prompt = null;
      s.drip = { next: nextDripAt(Date.now(), this.cfg.dripMin, this.cfg.dripMax, Math.random()), at: Date.now() };
    });
    this.refreshAll();
  }

  onDismiss() {
    this.endModal();
    this.store?.update((s) => {
      if (s.prompt?.owner === this.instanceId) s.prompt = null;
      s.drip = { next: Math.max(s.drip.next, Date.now() + DISMISS_MS), at: Date.now() };
    });
    this.refreshAll();
  }

  private releaseClaim() {
    this.store?.update((s) => { if (s.prompt?.owner === this.instanceId) s.prompt = null; });
  }

  onStoreChange() {
    if (!this.store) return;
    this.store.load();
    if (this.paused()) {   // a pause from any window closes the review here too
      if (this.modal) { const m = this.modal; this.endModal(); m.closeSilently(); }
      if (this.store.state.prompt?.owner === this.instanceId) this.releaseClaim();
      this.refreshAll();
      return;
    }
    // ponytail: a drip's last grade can leave the store done while this window's modal is still open
    if (this.modal && this.store.state.prompt?.owner !== this.instanceId) {
      const m = this.modal;
      this.endModal();
      m.closeSilently();
    }
    this.refreshAll();
  }

  pause(days: number) {
    if (!this.store) return;
    const until = addDays(this.today(), days - 1);
    this.store.update((s) => { s.pause = { until, at: Date.now() }; });
    if (this.modal) { const m = this.modal; this.endModal(); m.closeSilently(); this.releaseClaim(); }
    this.refreshAll();
  }

  resume() {
    if (!this.store) return;
    this.store.update((s) => { s.pause = { until: "", at: Date.now() }; });
    this.refreshAll();
  }

  // ---- surfaces -------------------------------------------------------------

  refreshAll() {
    this.rebuildLexicon();
    const today = this.today();
    const el = this.statusEl;
    if (el) {
      el.removeClass("is-due");
      if (!this.store) el.setText("Loanword: no deck");
      else if (this.paused()) el.setText(`Loanword ⏸ until ${this.store.state.pause.until}`);
      else {
        const s = this.session();
        if (isDone(s)) el.setText("Loanword ✓");
        else {
          el.setText(`Loanword: ${s.due.length} due${s.fresh.length ? ` · ${s.fresh.length} new` : ""} · ${nextLabel(s, this.store.state.drip.next, Date.now())}`);
          el.addClass("is-due");
        }
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof ProgressView) leaf.view.render(this.deck, this.store?.state ?? null, this.cfg, today, Date.now());
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      // ponytail: editor.cm is undocumented; without it swaps refresh on the next keystroke
      const cm = ((leaf.view as MarkdownView).editor as unknown as { cm?: EditorView })?.cm;
      cm?.dispatch({ effects: refreshSwaps.of(null) });
    }
  }

  async openSidebar() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (!right) return;
      await right.setViewState({ type: VIEW_TYPE, active: true });
      leaf = right;
    }
    this.app.workspace.revealLeaf(leaf);
    this.refreshAll();
  }

  async saveSettings() {
    await this.saveData(this.cfg);
    this.refreshAll();
  }
}

class LoanwordSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LoanwordPlugin) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Deck folder")
      .setDesc("Absolute path to the folder of deck notes. Progress lives in a .loanword folder inside it.")
      .addText((t) => {
        t.setValue(p.cfg.deckPath).onChange(async (v) => {
          p.cfg.deckPath = v.trim();
          await p.saveSettings();
        });
        // Re-boot on blur/Enter only, never per keystroke.
        t.inputEl.addEventListener("change", () => p.boot());
      });

    const num = (name: string, desc: string, key: "newPerDay" | "swapEvery" | "maxSwapsPerNote" | "dripMin" | "dripMax" | "cardsPerDrip" | "idleSeconds" | "firstDripMinutes") =>
      new Setting(containerEl).setName(name).setDesc(desc)
        .addText((t) => t.setValue(String(p.cfg[key])).onChange(async (v) => {
          const n = Number(v);
          const min = key === "dripMin" || key === "dripMax" || key === "cardsPerDrip" || key === "idleSeconds" || key === "firstDripMinutes" ? 1 : 0;
          if (!Number.isFinite(n) || n < min) return;
          p.cfg[key] = Math.floor(n);
          await p.saveSettings();
        }));
    num("New cards per day", "How many unseen cards the drips introduce each day.", "newPerDay");
    num("Swap every", "Minimum words between two swapped words in a note.", "swapEvery");
    num("Max swaps per note", "Upper bound on swapped words in one note.", "maxSwapsPerNote");
    num("Drip every (min)", "Shortest wait between two drips, in minutes.", "dripMin");
    num("Drip every (max)", "Longest wait between two drips, in minutes.", "dripMax");
    num("Cards per drip", "How many cards one drip asks.", "cardsPerDrip");
    num("Idle seconds", "A drip waits until you have not typed for this long.", "idleSeconds");
    num("First drip after (min)", "Minutes after Obsidian opens before the first drip.", "firstDripMinutes");

    new Setting(containerEl)
      .setName("Swap script")
      .addDropdown((d) => d
        .addOptions({ both: "Both", zh: "中文 only", ko: "한글 only" })
        .setValue(p.cfg.swapScript)
        .onChange(async (v) => { p.cfg.swapScript = v as LoanwordSettings["swapScript"]; await p.saveSettings(); }));

    new Setting(containerEl)
      .setName("Swaps in this vault")
      .addToggle((t) => t.setValue(p.cfg.swapsEnabled).onChange(async (v) => {
        p.cfg.swapsEnabled = v; await p.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("One vault-relative path per line. No swaps inside these.")
      .addTextArea((t) => t
        .setValue(p.cfg.excludedFolders.join("\n"))
        .onChange(async (v) => {
          p.cfg.excludedFolders = v.split("\n").map((s) => s.trim()).filter(Boolean);
          await p.saveSettings();
        }));
  }
}
