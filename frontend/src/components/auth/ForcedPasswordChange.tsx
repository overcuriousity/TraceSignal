import { ShieldAlert } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePasswordChangeForm } from "@/hooks/usePasswordChangeForm";

/** Blocking full-screen gate shown when the account (typically the seeded
 * admin bootstrap credential) must rotate its password before continuing. */
export function ForcedPasswordChange() {
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    mismatch,
    tooShort,
    canSubmit,
    mutation: { mutate, isPending, error },
  } = usePasswordChangeForm();

  return (
    <div className="flex h-svh items-center justify-center bg-[var(--color-bg-base)] px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert size={20} className="text-[var(--color-accent)]" />
          <h1 className="text-base font-semibold text-[var(--color-fg-primary)]">
            Password change required
          </h1>
        </div>
        <p className="mb-5 text-sm text-[var(--color-fg-muted)]">
          This account is using a one-time bootstrap password. Set a new password to continue.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-secondary)]">
            Current password
            <Input
              type="password"
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-secondary)]">
            New password (min. 8 characters)
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-secondary)]">
            Confirm new password
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {tooShort && (
            <p className="text-xs text-[var(--color-danger)]">Must be at least 8 characters.</p>
          )}
          {mismatch && <p className="text-xs text-[var(--color-danger)]">Passwords don't match.</p>}
          {error && (
            <p className="text-xs text-[var(--color-danger)]">
              {error instanceof ApiError ? error.message : "Something went wrong."}
            </p>
          )}
          <Button type="submit" variant="accent" disabled={!canSubmit || isPending} className="mt-2">
            {isPending ? "Changing..." : "Change password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
