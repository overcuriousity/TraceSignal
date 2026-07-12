/**
 * App footer — a thin, static strip at the bottom of the shell.
 *
 * Deliberately NOT rendered inside a timeline (Explorer / Visualize): those
 * views are dense, vertically-constrained workspaces (event grid, histogram,
 * side panels) where a footer would steal scarce rows. AppShell gates it on
 * the route — see `isTimelineRoute`.
 */
import { Activity } from "lucide-react";

export function Footer() {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 text-[11px] text-[var(--color-fg-muted)]">
      <span className="flex items-center gap-1.5">
        <Activity size={11} className="text-[var(--color-accent)]" />
        <span className="font-medium text-[var(--color-fg-secondary)]">Vestigo</span>
        <span className="italic">· Every trace confesses. Nothing is ever forgotten.</span>
      </span>
      <span>Airgapped by default · v{__APP_VERSION__}</span>
    </footer>
  );
}
