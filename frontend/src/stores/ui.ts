/**
 * UI preferences store — persisted to localStorage.
 * Handles column config, panel layout toggles, histogram, and sort direction.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  /** Columns visible in the event grid, in order. */
  visibleColumns: string[];
  setVisibleColumns: (cols: string[]) => void;

  /** Whether the analysis panel is open. */
  analysisPanelOpen: boolean;
  setAnalysisPanelOpen: (open: boolean) => void;

  /** Whether the filter rail is collapsed on mobile. */
  filterRailOpen: boolean;
  setFilterRailOpen: (open: boolean) => void;

  /** Whether the time histogram is shown above the event grid. */
  histogramOpen: boolean;
  setHistogramOpen: (open: boolean) => void;

  /** Chronological sort direction for the event grid. */
  sortDir: "asc" | "desc";
  setSortDir: (dir: "asc" | "desc") => void;
}

export const DEFAULT_COLUMNS = [
  "timestamp",
  "source",
  "message",
  "tags",
  "_annotations",
];

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      visibleColumns: DEFAULT_COLUMNS,
      setVisibleColumns: (cols) => set({ visibleColumns: cols }),

      analysisPanelOpen: false,
      setAnalysisPanelOpen: (open) => set({ analysisPanelOpen: open }),

      filterRailOpen: true,
      setFilterRailOpen: (open) => set({ filterRailOpen: open }),

      histogramOpen: true,
      setHistogramOpen: (open) => set({ histogramOpen: open }),

      sortDir: "desc",
      setSortDir: (dir) => set({ sortDir: dir }),
    }),
    { name: "tv-ui" },
  ),
);
