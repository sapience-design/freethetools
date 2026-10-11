// A visible cue when a result changes under the person's eyes. Tools that work as you type
// (time zones, units, passwords, counts) rewrite their result without a button press, so the
// change itself must be seen: the changed element gets a short tint that fades out.
// Reduced motion is honoured by the global rule that stops animations.

/** Flash an element once. Safe to call again before the last flash ends. */
export function flash(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove("changed");
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add("changed");
}

/**
 * Set an element's text, and flash it when the text replaced an earlier one. The first text an
 * empty element gets is not a change, so a page never flashes as it loads. Returns true when it flashed.
 */
export function setLive(el: HTMLElement, text: string): boolean {
  if (el.textContent === text) return false;
  const had = !!el.textContent;
  el.textContent = text;
  if (had) flash(el);
  return had;
}
