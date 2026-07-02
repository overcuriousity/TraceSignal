import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;

export function DropdownMenuContent({
  className,
  children,
  sideOffset = 6,
  align = "end",
  ...props
}: RadixDropdown.DropdownMenuContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        className={cn(
          "z-50 min-w-[160px] rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-1 shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        sideOffset={sideOffset}
        align={align}
        {...props}
      >
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: RadixDropdown.DropdownMenuItemProps) {
  return (
    <RadixDropdown.Item
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2 rounded px-2 text-sm text-[var(--color-fg-primary)] outline-none transition-base data-[highlighted]:bg-[var(--color-bg-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: RadixDropdown.DropdownMenuSeparatorProps) {
  return (
    <RadixDropdown.Separator
      className={cn("my-1 h-px bg-[var(--color-border-strong)]", className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: RadixDropdown.DropdownMenuLabelProps) {
  return (
    <RadixDropdown.Label
      className={cn("px-2 py-1 text-xs text-[var(--color-fg-muted)]", className)}
      {...props}
    />
  );
}
