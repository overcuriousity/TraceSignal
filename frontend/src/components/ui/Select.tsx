import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: RadixSelect.SelectTriggerProps) {
  return (
    <RadixSelect.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg-primary)] transition-base focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
      <RadixSelect.Icon>
        <ChevronDown size={14} className="text-[var(--color-fg-muted)]" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: RadixSelect.SelectContentProps) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        className={cn(
          "z-50 overflow-hidden rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-lg",
          className,
        )}
        position="popper"
        sideOffset={4}
        {...props}
      >
        <RadixSelect.Viewport className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto p-1">{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
}

export function SelectItem({ className, children, ...props }: RadixSelect.SelectItemProps) {
  return (
    <RadixSelect.Item
      className={cn(
        "relative flex h-8 cursor-pointer select-none items-center rounded px-6 text-sm text-[var(--color-fg-primary)] outline-none transition-base data-[highlighted]:bg-[var(--color-bg-hover)]",
        className,
      )}
      {...props}
    >
      <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check size={13} className="text-[var(--color-accent)]" />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
