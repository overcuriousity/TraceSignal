import * as Toast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const ToastProvider = Toast.Provider;
export const ToastViewport = () => (
  <Toast.Viewport className="fixed bottom-4 right-4 z-[200] flex max-h-screen w-80 flex-col gap-2 p-0 outline-none" />
);

interface ToastItemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: "default" | "success" | "danger";
}

export function ToastItem({
  open,
  onOpenChange,
  title,
  description,
  variant = "default",
}: ToastItemProps) {
  const variantClass = {
    default: "border-[var(--color-border-strong)]",
    success: "border-[var(--color-success)] border-opacity-40",
    danger: "border-[var(--color-danger)] border-opacity-40",
  }[variant];

  return (
    <Toast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={4000}
      className={cn(
        "group rounded-lg border bg-[var(--color-bg-elevated)] p-3 shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0",
        "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full",
        variantClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Toast.Title className="text-sm font-medium text-[var(--color-fg-primary)]">
            {title}
          </Toast.Title>
          {description && (
            <Toast.Description className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
              {description}
            </Toast.Description>
          )}
        </div>
        <Toast.Close className="shrink-0 rounded p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] transition-base">
          <X size={14} />
        </Toast.Close>
      </div>
    </Toast.Root>
  );
}
