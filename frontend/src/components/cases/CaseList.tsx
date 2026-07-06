import { useQuery } from "@tanstack/react-query";
import { casesApi } from "@/api/cases";
import { CaseCard } from "./CaseCard";
import { Spinner } from "@/components/ui/Spinner";
import { FolderOpen } from "lucide-react";

export function CaseList() {
  const { data: cases, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => casesApi.list(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-fg-muted)]">
        <Spinner size={20} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
        Failed to load cases: {(error as Error).message}
      </div>
    );
  }

  if (!cases || cases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-fg-muted)]">
        <FolderOpen size={40} className="opacity-30" />
        <p className="text-sm">No investigation cases yet.</p>
        <p className="text-xs">Create a case to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-tour="case-list">
      {cases.map((c) => (
        <CaseCard key={c.id} case_={c} />
      ))}
    </div>
  );
}
