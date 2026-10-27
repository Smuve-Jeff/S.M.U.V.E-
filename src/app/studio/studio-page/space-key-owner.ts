/**
 * Does the focused element own the Space bar?
 *
 * Space natively activates a focused control, and `preventDefault()` does not
 * stop propagation — so a document-level play/pause that claims the key while a
 * button has focus runs both actions, once. The targets below keep the key.
 *
 * Note what is deliberately *not* here: a bare `[tabindex]` element. The
 * piano-roll grid is focusable for arrow-key editing and handles Space itself
 * (it sets `defaultPrevented`, which the caller honours before this is ever
 * consulted); the other focusable surfaces — the arrangement's timeline host,
 * the mixer, the inspector's scrollers — never use Space at all. Yielding to
 * `tabindex` therefore made the transport key dead wherever focus happened to
 * sit, which is most of the workspace. Yield to the controls that consume it,
 * not to focusability itself.
 *
 * `closest()` rather than a `tagName` check because the real target is usually
 * a `<span>` or an icon inside the button.
 */
const SPACE_OWNERS = [
  "button",
  "a[href]",
  "select",
  "summary",
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(", ");

export function ownsSpaceKey(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(SPACE_OWNERS) !== null;
}
