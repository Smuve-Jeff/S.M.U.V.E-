@@
   challengePlayer(toUserId: string, gameId: string) {
     const fromUserId = this.currentUserId();
     if (!fromUserId || !toUserId || !gameId) return;
-    this.emitChallenge(toUserId, gameId);
+    // Include resolved game title when emitting so the recipient gets a human
+    // friendly name even if their client hasn't loaded the feed yet.
+    const gameName = this.gameService.getGameById(gameId)?.name || gameId;
+    this.emitChallenge(toUserId, gameId, gameName);
   }
@@
   private socket: any = null;
   bindSocket(socket: any) {
     this.socket = socket;
   }
-  private emitChallenge(toUserId: string, gameId: string) {
+  private emitChallenge(toUserId: string, gameId: string, gameName?: string) {
     // Primary: emit via socket for real-time delivery
     if (this.socket && typeof this.socket.emit === 'function') {
-      this.socket.emit('challenge_player', { toUserId, gameId });
+      this.socket.emit('challenge_player', { toUserId, gameId, gameName });
     }
     // Backup: persist via REST so challenge survives socket drops
-    this.persistChallengeViaRest(toUserId, gameId);
+    this.persistChallengeViaRest(toUserId, gameId, gameName);
   }
@@
   async persistChallengeViaRest(toUserId: string, gameId: string) {
     const userId = this.currentUserId();
     if (!userId) return;
     try {
       await firstValueFrom(
         this.http.post(
           `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges`,
-          { toUserId, gameId },
+          { toUserId, gameId, gameName: this.gameService.getGameById(gameId)?.name || gameId },
           { headers: this.authHeaders() }
         )
       );
     } catch (e) {
       // Silent fallback — socket path is primary. Log for debugging.
       console.warn(
         '[ChallengeInbox] REST challenge persist failed (socket primary):',
         e
       );
     }
   }
@@
 }
