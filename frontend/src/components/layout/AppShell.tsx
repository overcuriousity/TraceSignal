import { Outlet, useLocation } from "react-router-dom";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { TourProvider } from "@/components/tour/TourProvider";
import { ToastProvider, ToastViewport } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/Tooltip";

/**
 * Inside a timeline (Explorer / Visualize) the footer is suppressed — those
 * views own every vertical pixel for the grid/histogram/panels. Matches
 * `/cases/:caseId/timelines/:timelineId` and its `/visualize` child.
 */
function isTimelineRoute(pathname: string): boolean {
  return /\/cases\/[^/]+\/timelines\/[^/]+/.test(pathname);
}

export function AppShell() {
  const { pathname } = useLocation();
  const showFooter = !isTimelineRoute(pathname);

  return (
    <ToastProvider swipeDirection="right">
      <TooltipProvider>
        <div className="flex h-svh flex-col overflow-hidden bg-[var(--color-bg-base)]">
          <TopBar />
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
          {showFooter && <Footer />}
        </div>
        <ToastViewport />
        <TourProvider />
      </TooltipProvider>
    </ToastProvider>
  );
}
