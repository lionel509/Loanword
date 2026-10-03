export interface LoanwordSettings {
  /** Absolute folder holding the deck notes; "" = unset. */
  deckPath: string;
  newPerDay: number;
  swapEvery: number;
  maxSwapsPerNote: number;
  swapScript: "zh" | "ko" | "both";
  swapsEnabled: boolean;
  /** Vault-relative, case-insensitive prefix match. */
  excludedFolders: string[];
}

export const DEFAULT_SETTINGS: LoanwordSettings = {
  deckPath: "",
  newPerDay: 5,
  swapEvery: 60,
  maxSwapsPerNote: 12,
  swapScript: "both",
  swapsEnabled: true,
  excludedFolders: [],
};

/** Ghostwriter's blockedFolders rule, case-insensitive, trailing slash optional. */
export function isExcluded(path: string, folders: string[]): boolean {
  const p = path.toLowerCase();
  return folders.some((f) => {
    const dir = f.trim().replace(/\/+$/, "").toLowerCase();
    return !!dir && (p === dir || p.startsWith(dir + "/"));
  });
}
