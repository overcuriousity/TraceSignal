import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

/** Gate for /admin/* routes — nested inside RequireAuth, so `user` is
 * always resolved by the time this renders. */
export function RequireAdmin() {
  const user = useAuthStore((s) => s.user);
  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
