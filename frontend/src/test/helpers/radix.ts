/**
 * jsdom implements neither the Pointer Capture API nor `scrollIntoView`,
 * both of which Radix's Select uses while opening. Without these stubs the
 * trigger simply never opens and the test sees an empty listbox — a failure
 * that reads like a component bug rather than a missing browser API.
 */
export function installRadixJsdomStubs(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
}
