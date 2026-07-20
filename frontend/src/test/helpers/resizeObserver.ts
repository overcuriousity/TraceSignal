/**
 * jsdom has no ResizeObserver, which `ChartFrame` depends on to learn its
 * container width. Without it every chart renders behind its
 * `{width > 0 && ...}` gate and assertions see an empty SVG.
 *
 * Shared rather than copied per test file: a chart test that forgets the
 * stub fails with a `ReferenceError` from deep inside React's commit phase,
 * which reads as a component bug rather than a missing polyfill.
 */
export function installFakeResizeObserver(width = 400): void {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      // Synchronously report a fixed content width, as if the container were
      // already laid out — jsdom never actually lays anything out.
      this.cb(
        [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error -- jsdom has no native ResizeObserver
  global.ResizeObserver = FakeResizeObserver;
}
