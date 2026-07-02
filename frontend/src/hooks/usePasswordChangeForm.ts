import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { useInvalidateCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/auth";

/** Shared state, validation, and mutation for the two password-change forms
 * (ForcedPasswordChange's blocking gate, SettingsPage's self-service
 * section) — same fields, validation, and error copy, only the surrounding
 * layout differs. */
export function usePasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const setUser = useAuthStore((s) => s.setUser);
  const invalidate = useInvalidateCurrentUser();

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(newPassword, currentPassword || undefined),
    onSuccess: (user) => {
      setUser(user);
      invalidate();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const canSubmit = Boolean(currentPassword) && newPassword.length >= 8 && !mismatch;

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    mismatch,
    tooShort,
    canSubmit,
    mutation,
  };
}
