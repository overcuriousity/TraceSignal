import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { ToastProvider, ToastViewport } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/Tooltip";

export function AppShell() {
  return (
    <ToastProvider swipeDirection="right">
      <TooltipProvider>
        <div className="flex h-svh flex-col overflow-hidden bg-[var(--color-bg-base)]">
          <TopBar />
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <ToastViewport />
      </TooltipProvider>
    </ToastProvider>
  );
}
