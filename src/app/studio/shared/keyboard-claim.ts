/**
 * One studio key press, one handler.
 *
 * The shell mounts the arrangement and the piano roll at the same time — the
 * arrangement appears in both the desktop and the mobile layout — so a single
 * window keydown reaches more than one component listener. Ctrl+D means
 * duplicate in both: notes in the editor, clips or the selected track in the
 * arrangement. Without coordination one press would run both edits.
 *
 * A handler claims the event at the moment it decides to act, so a component
 * with nothing to act on (no selection) never blocks the other one.
 */
const claimed = new WeakSet<Event>();

export function claimKeyEvent(event: Event): boolean {
  if (claimed.has(event)) return false;
  claimed.add(event);
  return true;
}
