import type { Case, User } from "@/api/types";

/** Mirrors the backend's `resolve_case_access` (api/deps.py) access levels,
 * computed client-side purely to decide what UI to show/hide — the backend
 * remains the source of truth and re-checks on every request. */
export type CaseAccessLevel = "none" | "read" | "contribute" | "manage";

export function resolveCaseAccess(case_: Case, user: User | null): CaseAccessLevel {
  if (!user) return "none";
  if (user.is_admin) return "manage";
  if (case_.team_id) {
    const membership = user.teams?.find((t) => t.id === case_.team_id);
    if (!membership) return "none";
    return membership.role === "manager" ? "manage" : "contribute";
  }
  if (case_.owner_id === user.id) return "manage";
  return "none";
}

export function canManageCase(case_: Case, user: User | null): boolean {
  return resolveCaseAccess(case_, user) === "manage";
}

/** Teams the user may create a *team* case for (must be a manager, or admin sees none
 * here — admins can still create personal cases and aren't forced to pick a team). */
export function manageableTeams(user: User | null): { id: string; name: string }[] {
  return (user?.teams ?? []).filter((t) => t.role === "manager").map((t) => ({ id: t.id, name: t.name }));
}
