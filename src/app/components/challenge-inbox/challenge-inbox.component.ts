@@
   opponentName(c: ChallengeRecord): string {
     const me = this.profileService.profile().id;
     if (c.toUserId === me) return c.fromUserName || c.fromUserId;
     return c.toUserId;
   }
 
   formatGameName(gameId: string): string {
-    return gameId.toUpperCase().replace(/-/g, ' ');
+    // Prefer canonical title from the GameService when available to avoid
+    // showing raw slugs or ids. Fall back to the legacy slug formatter.
+    const game = this.gameService.getGameById?.(gameId);
+    if (game && typeof game.name === 'string' && game.name.trim() !== '') {
+      return game.name;
+    }
+    return (gameId || '').toUpperCase().replace(/-/g, ' ');
   }
 }
