import { fetchBlobGet, get, patch, post } from "./client";
import type { User } from "./types";

export const authApi = {
  login: (username: string, password: string) =>
    post<{ user: User }>("/auth/login", { username, password }).then((r) => r.user),

  logout: () => post<{ logged_out: boolean }>("/auth/logout"),

  me: () => get<{ user: User }>("/auth/me").then((r) => r.user),

  updateProfile: (payload: { username?: string; display_name?: string }) =>
    patch<{ user: User }>("/auth/me", payload).then((r) => r.user),

  changePassword: (newPassword: string, currentPassword?: string) =>
    post<{ user: User }>("/auth/me/password", {
      new_password: newPassword,
      current_password: currentPassword,
    }).then((r) => r.user),

  downloadMyAudit: (format: "csv" | "json" = "csv") =>
    fetchBlobGet("/auth/me/audit", { format }),

  oidcLoginUrl: () => `${(import.meta.env.VITE_API_BASE ?? "") + "/api"}/auth/oidc/login`,
};
