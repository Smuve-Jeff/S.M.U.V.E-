@@
 export function validateAndRepairGame(game: Game): Game {
@@
 }
 @Injectable({
   providedIn: 'root',
 })
 export class GameService {
   private http = inject(HttpClient);
   private feedCache$?: Observable<ThaSpotFeed>;
+  // Cached feed + quick lookup map to enable synchronous title resolution for UI
+  private cachedFeed: ThaSpotFeed | null = null;
+  private gameById = new Map<string, Game>();
@@
   buildIframeSandbox(game?: Game): string {
@@
   }
+
+  /** Synchronous lookup for a game by id. May return undefined if the feed
+   * hasn't been loaded yet. Components should call listGames() or loadFeedIfNeeded
+   * for guaranteed async resolution. */
+  getGameById(gameId: string): Game | undefined {
+    if (!gameId) return undefined;
+    return this.gameById.get(String(gameId));
+  }
+
+  /** Synchronous list of cached games (may be empty if feed hasn't loaded). */
+  listGamesSync(): Game[] {
+    return this.cachedFeed?.games ?? [];
+  }
+
+  /** Ensure the feed is loaded into the sync cache. Safe to call multiple times. */
+  private async loadFeedIfNeeded(): Promise<void> {
+    if (this.cachedFeed) return;
+    try {
+      const feed = await firstValueFrom(this.http.get<ThaSpotFeed>(THA_SPOT_FEED_URL));
+      this.cachedFeed = feed;
+      this.gameById.clear();
+      (feed.games || []).forEach((g) => this.gameById.set(String(g.id), g));
+    } catch (e) {
+      // swallow: callers should fallback to remote fetchs already present in other methods
+      console.warn('[GameService] failed to pre-cache tha-spot feed', e);
+    }
+  }
@@
 }
