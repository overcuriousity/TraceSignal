import * as RadixLabel from "@radix-ui/react-label";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: RadixLabel.LabelProps) {
  return (
    <RadixLabel.Root
      className={cn("text-xs font-medium text-[var(--color-fg-secondary)]", className)}
      {...props}
    />
  );
}
