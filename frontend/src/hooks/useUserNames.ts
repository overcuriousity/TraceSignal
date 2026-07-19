import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { buildUserNameMap, resolveUserName } from "@/lib/userNames";

/**
 * Resolve user ids to human names via the shared /api/auth/users directory.
 * Returns a resolver; while the directory loads (or on error) it degrades to
 * echoing the raw value, so callers can use it unconditionally.
 */
export function useUserNames(): (value: string | null) => string {
  const { data } = useQuery({
    queryKey: ["auth", "users"],
    queryFn: authApi.listUsers,
    staleTime: 300_000,
  });
  const map = data ? buildUserNameMap(data) : new Map<string, string>();
  return (value) => resolveUserName(map, value);
}
