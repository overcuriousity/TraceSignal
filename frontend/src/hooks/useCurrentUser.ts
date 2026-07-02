import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

/**
 * Resolves the current session against the server and keeps `useAuthStore`
 * in sync. Call this once near the app root (AppShell) — components that
 * just need the cached user should read `useAuthStore((s) => s.user)`
 * directly rather than re-triggering this query.
 */
export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.isSuccess) {
      setUser(query.data);
      setInitialized(true);
    } else if (query.isError && query.fetchStatus === "idle") {
      // Only trust an error once the query is settled — during a refetch the
      // previous (possibly stale) 401 is still exposed and must not sign the
      // user out mid-revalidation.
      const is401 = query.error instanceof ApiError && query.error.status === 401;
      if (is401) setUser(null);
      setInitialized(true);
    }
  }, [
    query.isSuccess,
    query.isError,
    query.fetchStatus,
    query.data,
    query.error,
    setUser,
    setInitialized,
  ]);

  return query;
}

/** Invalidate the cached current-user query (e.g. after login/logout/profile change). */
export function useInvalidateCurrentUser() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["auth", "me"] });
}
