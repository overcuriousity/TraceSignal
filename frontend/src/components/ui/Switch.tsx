import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: RadixSwitch.SwitchProps) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-[var(--color-bg-active)] transition-base data-[state=checked]:bg-[var(--color-accent)] disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}
