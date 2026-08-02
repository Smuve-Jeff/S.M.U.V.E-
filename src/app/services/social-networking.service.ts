@@
   launchPartyGame(gameId: string) {
     const partyId = this.currentPartyId();
     if (!partyId) return;
-    this.socket?.emit('party_launch_game', { partyId, gameId });
+    this.socket?.emit('party_launch_game', { partyId, gameId });
   }
@@
   async searchUsers(query: string): Promise<OnlineUser[]> {
@@
   }
@@
   queueForMatch(gameId: string) {
     const userId = this.profileService.profile().id;
     if (!userId) return;
     this.matchmakingStatus.set('searching');
-    this.socket?.emit('queue_for_match', { userId, gameId });
+    this.socket?.emit('queue_for_match', { userId, gameId });
   }
@@
   cancelMatch(gameId: string) {
     const userId = this.profileService.profile().id;
     if (!userId) return;
     this.matchmakingStatus.set('idle');
-    this.socket?.emit('cancel_match', { userId, gameId });
+    this.socket?.emit('cancel_match', { userId, gameId });
   }
