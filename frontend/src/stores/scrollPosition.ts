/**
 * Ephemeral scroll-position store — the event grid's currently-visible-row
 * timestamp, overlaid as a marker on TimelineHistogram.
 *
 * Deliberately a separate, non-persisted store rather than `useState` on
 * ExplorerPage: scroll fires on nearly every row crossed, and ExplorerPage
 * has no other reason to re-render on scroll — a page-level `useState` here
 * would re-render the whole page tree (FilterRail, EventGrid, AnalysisPanel)
 * on every update. TimelineHistogram alone subscribes to this value via a
 * selector, so only it re-renders.
 */
import { create } from "zustand";

interface ScrollPositionState {
  currentPositionTs: string | null;
  setCurrentPositionTs: (ts: string | null) => void;
}

export const useScrollPositionStore = create<ScrollPositionState>((set) => ({
  currentPositionTs: null,
  setCurrentPositionTs: (ts) => set({ currentPositionTs: ts }),
}));
