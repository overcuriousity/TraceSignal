import { cn } from "@/lib/cn";

/** Plain, lightweight table primitives for admin CRUD lists.
 *
 * Not related to the virtualized TanStack-table-based `EventGrid` — that one
 * is purpose-built for very large scrollable datasets. Admin lists (users,
 * teams, members) are small, so a simple semantic `<table>` is a better fit
 * than reaching for react-table again here.
 */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded border border-[var(--color-border-strong)]">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-[var(--color-border-strong)] bg-[var(--color-bg-active)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[var(--color-border-strong)]", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-base hover:bg-[var(--color-bg-hover)]", className)}
      {...props}
    />
  );
}

export function TableHeaderCell({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 text-[var(--color-fg-primary)]", className)} {...props} />;
}
