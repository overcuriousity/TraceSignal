/** The Vestigo brand mark: a regular track of steps, one band out of cadence. */
export function VestigoMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <polygon fill="#8b5cf6" points="2,4 26,4 22,11 2,11" />
      <polygon fill="#8b5cf6" points="8,15 32,15 28,22 8,22" />
      <polygon fill="#06b6d4" points="22,26 46,26 42,33 22,33" />
      <polygon fill="#8b5cf6" points="20,37 44,37 40,44 20,44" />
    </svg>
  );
}
