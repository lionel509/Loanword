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
