import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { setUnauthorizedHandler } from "./api/client";
import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";
import { useUiStore } from "./stores/ui";

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const density = useUiStore((s) => s.density);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  // A 401 from any API call means the session is gone (expired/revoked/never
  // existed) — clear the cached user and let RequireAuth redirect to /login
  // on the next render, rather than leaving stale UI state around.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      useAuthStore.getState().clear();
      queryClient.setQueryData(["auth", "me"], null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
