/**
 * The app's single QueryClient, with global success/error feedback wired at
 * the cache level so every mutation in the app surfaces failures without
 * per-call-site boilerplate (before this, 2 of ~80 mutations handled errors —
 * a failed click was silent).
 *
 * Per-mutation opt-in/out via `meta`:
 *   - `meta.successToast: string`  — show a success toast with this title.
 *   - `meta.errorTitle: string`    — toast title on failure (default "Action failed").
 *   - `meta.silentError: true`     — suppress the global error toast (for
 *     forms that render the error inline next to the button, e.g. login).
 * Queries support `meta.silentError` the same way.
 */
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { toast } from "@/stores/toasts";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      successToast?: string;
      errorTitle?: string;
      silentError?: boolean;
    };
    queryMeta: {
      silentError?: boolean;
    };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 401s are handled globally (session cleared → redirect to login) — a toast
 * on top of the redirect is noise. */
function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const title = mutation.meta?.successToast;
      if (title) toast.success(title);
    },
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError || isUnauthorized(error)) return;
      toast.error(mutation.meta?.errorTitle ?? "Action failed", errorMessage(error));
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silentError || isUnauthorized(error)) return;
      // Background refetch failures of data already on screen are surfaced
      // too — a stale panel silently pretending to be current is worse than
      // a toast. The store dedups identical messages, so one dead endpoint
      // feeding several panels produces a single toast.
      toast.error("Loading failed", errorMessage(error));
    },
  }),
});
