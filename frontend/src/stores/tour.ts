/**
 * Onboarding tour state machine. Deliberately not persisted: the only durable
 * state is the server-side `onboarding_completed` flag on the user — a page
 * refresh mid-tour restarts it from step 1 (skippable at any point).
 *
 * Components report user actions via `tourEvent()`, which is a no-op unless
 * the tour is active and the current step is waiting for that exact event —
 * callers never need to know about tour state.
 */
import { matchPath } from "react-router-dom";
import { create } from "zustand";
import { TOUR_STEPS, type TourEventName } from "@/lib/tourSteps";

export type TourStatus = "idle" | "active" | "finished";

interface TourState {
  status: TourStatus;
  stepIndex: number;
  start: () => void;
  next: () => void;
  back: () => void;
  /** Skip = finish early; the completion flag is persisted either way. */
  skip: () => void;
  /** Abort without marking complete (logout, PATCH failure). */
  stop: () => void;
  handleEvent: (name: TourEventName) => void;
  handleRouteChange: (pathname: string) => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  status: "idle",
  stepIndex: 0,

  start: () => set({ status: "active", stepIndex: 0 }),

  next: () =>
    set((s) => {
      if (s.status !== "active") return s;
      if (s.stepIndex >= TOUR_STEPS.length - 1) return { ...s, status: "finished" };
      return { ...s, stepIndex: s.stepIndex + 1 };
    }),

  back: () =>
    set((s) =>
      s.status === "active" && s.stepIndex > 0 ? { ...s, stepIndex: s.stepIndex - 1 } : s,
    ),

  skip: () => set((s) => (s.status === "active" ? { ...s, status: "finished" } : s)),

  stop: () => set({ status: "idle", stepIndex: 0 }),

  handleEvent: (name) => {
    const s = get();
    if (s.status !== "active") return;
    const advance = TOUR_STEPS[s.stepIndex]?.advance;
    if (advance?.type === "event" && advance.name === name) s.next();
  },

  handleRouteChange: (pathname) => {
    const s = get();
    if (s.status !== "active") return;
    const advance = TOUR_STEPS[s.stepIndex]?.advance;
    if (advance?.type === "route" && matchPath(advance.pattern, pathname)) s.next();
  },
}));

/** Fire-and-forget action notification for components (no-op when tour idle). */
export function tourEvent(name: TourEventName): void {
  useTourStore.getState().handleEvent(name);
}

