import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({ className, ...props }: RadixCheckbox.CheckboxProps) {
  return (
    <RadixCheckbox.Root
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] transition-base data-[state=checked]:border-[var(--color-accent)] data-[state=checked]:bg-[var(--color-accent)] disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <Check size={11} className="text-[var(--color-accent-fg)]" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
