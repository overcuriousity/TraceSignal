import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { enrichersApi } from "@/api/enrichers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function AdminEnrichersPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["admin", "enrichers", "geoip", "status"],
    queryFn: () => enrichersApi.geoipStatus(),
  });

  const { data: configs } = useQuery({
    queryKey: ["admin", "enrichers", "config"],
    queryFn: () => enrichersApi.adminConfigs(),
  });
  const geoipConfig = configs?.find((c) => c.key === "geoip");

  const autoRunMutation = useMutation({
    mutationFn: (autoRunDefault: boolean) =>
      enrichersApi.setAdminConfig("geoip", { auto_run_default: autoRunDefault }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "enrichers", "config"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => enrichersApi.uploadGeoipDb(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "enrichers", "geoip", "status"] });
      qc.invalidateQueries({ queryKey: ["enrichers"] });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">Enrichers</h2>

      <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-fg-primary)]">
              GeoIP (MaxMind GeoLite2)
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Resolves IP address fields to country/city. Requires an uploaded GeoLite2 City
              database (.mmdb).
            </p>
          </div>
          {isLoading ? (
            <Spinner size={16} />
          ) : (
            <Badge variant={status?.available ? "accent" : "muted"}>
              {status?.available ? "Available" : "Unavailable"}
            </Badge>
          )}
        </div>

        {status && !status.available && status.reason && (
          <p className="text-xs text-[var(--color-warning)]">{status.reason}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-[var(--color-fg-muted)]">
          <span>{status?.uploaded ? `Database uploaded (${fmtBytes(status.size_bytes)})` : "No database uploaded"}</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded border border-[var(--color-border-subtle)] px-3 py-2">
          <div>
            <p className="text-xs font-medium text-[var(--color-fg-primary)]">
              Run automatically on new ingests
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Instance-wide default. Applies to every timeline without its own enricher
              configuration; per-timeline settings override this.
            </p>
          </div>
          <Switch
            checked={geoipConfig?.auto_run_default ?? false}
            disabled={autoRunMutation.isPending || !geoipConfig}
            onCheckedChange={(v) => autoRunMutation.mutate(v)}
          />
        </div>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".mmdb"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <UploadCloud size={14} className="mr-1.5" />
            {uploadMutation.isPending
              ? "Uploading…"
              : status?.uploaded
                ? "Replace database"
                : "Upload database"}
          </Button>
          {uploadMutation.isError && (
            <p className="mt-2 text-xs text-[var(--color-danger)]">
              {(uploadMutation.error as Error).message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
