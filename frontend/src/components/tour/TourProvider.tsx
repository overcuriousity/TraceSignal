/**
 * Mounts the onboarding tour: auto-starts it for users who haven't completed
 * it, feeds route changes into the tour state machine, and persists the
 * completion flag (server-side, per user) when the tour finishes or is
 * skipped.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";
import { useTourStore } from "@/stores/tour";
import { TourOverlay } from "./TourOverlay";

export function TourProvider() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  const status = useTourStore((s) => s.status);
  const location = useLocation();
  // Blocks re-arming when the completion PATCH failed — otherwise the stale
  // `onboarding_completed: false` on the cached user would restart the tour
  // the moment it's dismissed.
  const persistFailedRef = useRef(false);

  useEffect(() => {
    const tour = useTourStore.getState();
    if (!user) {
      if (status !== "idle") tour.stop();
      return;
    }
    if (
      status === "idle" &&
      !user.onboarding_completed &&
      !user.must_change_password &&
      !persistFailedRef.current
    ) {
      tour.start();
    }
  }, [user, status]);

  useEffect(() => {
    useTourStore.getState().handleRouteChange(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (status !== "finished") return;
    let cancelled = false;
    (async () => {
      try {
        const updated = await authApi.updateProfile({ onboarding_completed: true });
        if (!cancelled) setUser(updated);
        // Update the cached query in place rather than invalidating: an
        // invalidate kicks off a refetch during which useCurrentUser re-syncs
        // the *stale* cached user (flag still false) into the auth store,
        // which would instantly restart the tour.
        qc.setQueryData(["auth", "me"], updated);
      } catch {
        persistFailedRef.current = true;
      }
      useTourStore.getState().stop();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return status === "active" ? <TourOverlay /> : null;
}
