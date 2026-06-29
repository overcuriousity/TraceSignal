import * as RadixProgress from "@radix-ui/react-progress";
import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number; // 0–100
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
}

export function Progress({
  value,
  className,
  trackClassName,
  indicatorClassName,
}: ProgressProps) {
  return (
    <RadixProgress.Root
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-active)]",
        className,
        trackClassName,
      )}
      value={value}
    >
      <RadixProgress.Indicator
        className={cn(
          "h-full bg-[var(--color-accent)] transition-all duration-300 ease-out",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </RadixProgress.Root>
  );
}
