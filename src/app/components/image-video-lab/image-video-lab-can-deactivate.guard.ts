import type { CanDeactivateFn } from '@angular/router';

/** The part of the Lab a navigation guard needs; keeps the import light. */
export interface UnsavedVideoWork {
  canLeaveLab(): boolean | Promise<boolean>;
}

/**
 * A route change is not a browser unload, so `beforeunload` cannot protect an
 * unsaved timeline. This guard asks the Lab before the router destroys it.
 */
export const imageVideoLabCanDeactivate: CanDeactivateFn<UnsavedVideoWork> = (
  component,
) => (component?.canLeaveLab ? component.canLeaveLab() : true);
