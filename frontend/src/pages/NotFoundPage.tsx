import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { SearchX } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <SearchX size={48} className="text-[var(--color-fg-muted)] opacity-30" />
      <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">
        404 — Page Not Found
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)]">
        The page you're looking for doesn't exist.
      </p>
      <Link to="/">
        <Button variant="accent">Back to Cases</Button>
      </Link>
    </div>
  );
}
