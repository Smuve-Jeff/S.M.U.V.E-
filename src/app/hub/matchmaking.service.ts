@@
 function serverToClientChallenge(sc: ServerChallenge): PlayerChallenge {
   return {
     id: `chal-${sc.id}`,
     fromId: sc.fromUserId,
     fromName: sc.fromUserName || sc.fromUserId,
     toId: sc.toUserId,
     toName: sc.toUserId,
     gameId: sc.gameId,
-    gameName: sc.gameId,
+    // Resolve to canonical title when possible via GameService. The service
+    // is injected on the class and available synchronously via gameService.getGameById
+    gameName:
+      (typeof (this as any).gameService?.getGameById === 'function' &&
+      (this as any).gameService.getGameById(sc.gameId)?.name) || sc.gameId,
     status: sc.status as ChallengeStatus,
     message: sc.message || '',
     created: sc.timestamp,
     expiresAt: sc.timestamp + 7 * 24 * 60 * 60 * 1000,
   };
 }
@@
     const challenge: PlayerChallenge = {
       id: `pending-${Date.now()}`,
       fromId: this.playerId(),
       fromName: this.playerName(),
       toId: toUserId,
       toName,
       gameId,
-      gameName: gameId,
+      gameName: this.gameService.getGameById(gameId)?.name || gameId,
       status: 'pending',
       message,
       created: Date.now(),
       expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
     };
@@
 }
