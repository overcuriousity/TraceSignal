import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trash2, Users } from "lucide-react";
import { adminApi } from "@/api/admin";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

export function AdminTeamsPage() {
  const qc = useQueryClient();
  const { data: teams, isLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: adminApi.listTeams,
  });

  const deleteTeam = useMutation({
    mutationFn: (teamId: string) => adminApi.deleteTeam(teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "teams"] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
          Teams ({teams?.length ?? 0})
        </h2>
        <CreateTeamDialog />
      </div>
      <div className="grid gap-2">
        {teams?.map((team) => (
          <div
            key={team.id}
            className="group flex items-center justify-between rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-4 py-3 transition-base hover:border-[var(--color-accent)]/40"
          >
            <Link to={`/admin/teams/${team.id}`} className="flex flex-1 items-center gap-3">
              <Users size={16} className="text-[var(--color-fg-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--color-fg-primary)]">
                  {team.name}
                </div>
                {team.description && (
                  <div className="text-xs text-[var(--color-fg-muted)]">{team.description}</div>
                )}
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] group-hover:opacity-100"
              disabled={deleteTeam.isPending}
              onClick={() => {
                if (confirm(`Delete team "${team.name}"? Its cases become personal.`)) {
                  deleteTeam.mutate(team.id);
                }
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        {teams?.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
            No teams yet. Create one to start grouping cases and analysts.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateTeamDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => adminApi.createTeam(name.trim(), description.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      setOpen(false);
      setName("");
      setDescription("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <Plus size={14} /> New team
        </Button>
      </DialogTrigger>
      <DialogContent title="New investigation team">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">Team name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Description
            </label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && (
            <p className="text-xs text-[var(--color-danger)]">
              {error instanceof ApiError ? error.message : "Something went wrong."}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="accent"
              size="sm"
              disabled={!name.trim() || isPending}
              onClick={() => mutate()}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
