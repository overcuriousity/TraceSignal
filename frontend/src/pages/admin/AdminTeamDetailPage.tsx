import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { adminApi } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { TeamRole } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

export function AdminTeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const qc = useQueryClient();

  const { data: teams } = useQuery({ queryKey: ["admin", "teams"], queryFn: adminApi.listTeams });
  const team = teams?.find((t) => t.id === teamId);

  const { data: members, isLoading } = useQuery({
    queryKey: ["admin", "teams", teamId, "members"],
    queryFn: () => adminApi.listMembers(teamId!),
    enabled: !!teamId,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin", "teams", teamId, "members"] });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamRole }) =>
      adminApi.setMemberRole(teamId!, userId, role),
    onSuccess: invalidate,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => adminApi.removeMember(teamId!, userId),
    onSuccess: invalidate,
  });

  if (!teamId) return null;

  return (
    <div className="space-y-4">
      <Link
        to="/admin/teams"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]"
      >
        <ArrowLeft size={12} /> Back to teams
      </Link>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
          {team?.name ?? "Team"} — Members ({members?.length ?? 0})
        </h2>
        <AddMemberDialog teamId={teamId} onAdded={invalidate} existingIds={members?.map((m) => m.id) ?? []} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size={20} />
        </div>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>User</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell />
            </tr>
          </TableHead>
          <TableBody>
            {members?.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.username}</TableCell>
                <TableCell>
                  <Select
                    value={m.role}
                    onValueChange={(role) => setRole.mutate({ userId: m.id, role: role as TeamRole })}
                  >
                    <SelectTrigger className="h-7 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
                    onClick={() => removeMember.mutate(m.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {members?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[var(--color-fg-muted)]">
                  No members yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AddMemberDialog({
  teamId,
  existingIds,
  onAdded,
}: {
  teamId: string;
  existingIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [role, setRole] = useState<TeamRole>("member");

  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.listUsers(),
    enabled: open,
  });
  const candidates = users?.filter((u) => !existingIds.includes(u.id)) ?? [];

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => adminApi.addMember(teamId, userId!, role),
    onSuccess: () => {
      onAdded();
      setOpen(false);
      setUserId(undefined);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <UserPlus size={14} /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent title="Add team member">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">User</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member — access team cases</SelectItem>
                <SelectItem value="manager">Manager — create/delete team cases</SelectItem>
              </SelectContent>
            </Select>
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
            <Button variant="accent" size="sm" disabled={!userId || isPending} onClick={() => mutate()}>
              {isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
