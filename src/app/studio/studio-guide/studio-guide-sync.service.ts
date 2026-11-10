import {
  DestroyRef,
  Injectable,
  effect,
  inject,
  signal,
} from "@angular/core";

import { AuthService } from "../../services/auth.service";
import {
  UserProfileService,
  type UserProfile,
} from "../../services/user-profile.service";
import { StudioGuideService } from "./studio-guide.service";

export type GuideSyncState = "local" | "syncing" | "synced" | "error";

function readRemoteProgress(profile: UserProfile | null): string[] {
  const ids = profile?.settings?.studio?.guideCompletedLessonIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && !!id);
}

function signature(lessonIds: readonly string[]): string {
  return [...new Set(lessonIds)].sort().join("|");
}

/**
 * Keeps the Masterclass progress that lives on this device and the copy on the
 * artist's profile in step.
 *
 * Hydration unions the two sides, so finishing a lesson offline is never lost
 * when the account is one save behind. Saves are debounced and serialised:
 * tapping three lessons quickly produces one profile write instead of three
 * competing ones. Local storage remains authoritative offline; a failed cloud
 * write leaves the ticks intact and the UI says the account copy is behind.
 */
@Injectable({ providedIn: "root" })
export class StudioGuideSyncService {
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(UserProfileService);
  private readonly guide = inject(StudioGuideService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<GuideSyncState>("local");

  private hydratedFor: string | null = null;
  private savedSignature = "";
  private queuedSignature = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight = false;

  constructor() {
    // Hydrate once per signed-in account, as soon as its profile is loaded.
    effect(() => {
      const user = this.auth.currentUser();
      const guest = this.auth.isGuest();
      const hydrated = this.profiles.hydrated();
      const profile = this.profiles.profile();

      if (!user?.id || guest) {
        this.hydratedFor = null;
        this.queuedSignature = "";
        this.state.set("local");
        return;
      }

      if (!hydrated) {
        this.state.set("local");
        return;
      }

      if (this.hydratedFor === user.id) return;

      this.hydratedFor = user.id;
      this.state.set("syncing");
      const remote = readRemoteProgress(profile);
      if (remote.length) this.guide.mergeCompleted(remote);

      const merged = this.guide.completedLessonIds();
      if (signature(merged) === signature(remote)) {
        this.savedSignature = signature(merged);
        this.queuedSignature = this.savedSignature;
        this.state.set("synced");
      } else {
        this.queueSave(user.id, merged);
      }
    });

    // Every later local change (including a reset) queues a profile write.
    effect(() => {
      const user = this.auth.currentUser();
      const ids = this.guide.completedLessonIds();
      if (!user?.id || this.auth.isGuest()) return;
      if (this.hydratedFor !== user.id) return;

      const nextSignature = signature(ids);
      if (nextSignature === this.savedSignature) return;
      this.queueSave(user.id, ids);
    });

    this.destroyRef.onDestroy(() => {
      if (this.saveTimer) clearTimeout(this.saveTimer);
    });
  }

  private queueSave(userId: string, lessonIds: readonly string[]): void {
    const nextSignature = signature(lessonIds);
    if (nextSignature === this.savedSignature) {
      this.queuedSignature = nextSignature;
      this.state.set("synced");
      return;
    }
    if (nextSignature === this.queuedSignature) return;

    this.queuedSignature = nextSignature;
    this.state.set("syncing");
    this.scheduleSave(userId);
  }

  private scheduleSave(userId: string, delay = 350): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush(userId);
    }, delay);
  }

  private async flush(userId: string): Promise<void> {
    if (this.saveInFlight) {
      this.scheduleSave(userId, 150);
      return;
    }

    const user = this.auth.currentUser();
    if (!user?.id || user.id !== userId || this.hydratedFor !== userId) return;

    const ids = this.guide.completedLessonIds();
    const nextSignature = signature(ids);
    if (nextSignature === this.savedSignature) {
      this.queuedSignature = nextSignature;
      this.state.set("synced");
      return;
    }

    this.saveInFlight = true;
    try {
      const saved = await this.profiles.saveStudioGuideProgress(ids);
      if (!saved) {
        this.queuedSignature = "";
        this.state.set("error");
        return;
      }

      this.savedSignature = nextSignature;
      this.queuedSignature = nextSignature;
      const latest = this.guide.completedLessonIds();
      if (signature(latest) === nextSignature) {
        this.state.set("synced");
      } else {
        this.queueSave(userId, latest);
      }
    } catch {
      this.queuedSignature = "";
      this.state.set("error");
    } finally {
      this.saveInFlight = false;
    }
  }
}
