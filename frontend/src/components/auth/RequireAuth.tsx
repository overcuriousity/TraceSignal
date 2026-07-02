import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/auth";
import { Spinner } from "@/components/ui/Spinner";
import { ForcedPasswordChange } from "./ForcedPasswordChange";

/** Gate for the authenticated app shell: resolves the session, redirects to
 * /login if there isn't one, and blocks on a forced password change if the
 * account (typically the freshly-seeded admin) hasn't rotated it yet. */
export function RequireAuth() {
  const location = useLocation();
  const { isLoading } = useCurrentUser();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized && isLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.must_change_password) {
    return <ForcedPasswordChange />;
  }

  return <Outlet />;
}
