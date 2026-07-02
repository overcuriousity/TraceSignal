import { useEffect, useState } from "react";

/** Return a debounced copy of `value` that only updates after `delayMs` of
 * no further changes. Used to avoid firing a query (or other expensive
 * work) on every keystroke of a text/number input. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
