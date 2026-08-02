@@
-        partyId,
-        gameId,
-      });
+        partyId,
+        gameId,
+      });
     });
@@
-        io.to(getPartyRoom(partyId)).emit('user_joined_party', {
-        userId,
-        artistName: memberMeta.artistName || userId,
-      });
+        io.to(getPartyRoom(partyId)).emit('user_joined_party', {
+        userId,
+        artistName: memberMeta.artistName || userId,
+      });
     });
@@
-        io.to(getPartyRoom(partyId)).emit('user_left_party', { userId });
+        io.to(getPartyRoom(partyId)).emit('user_left_party', { userId });
       }
     }
@@
-          io.to(getPartyRoom(partyId)).emit('party_launch_game', {
-        partyId,
-        gameId,
-      });
+          io.to(getPartyRoom(partyId)).emit('party_launch_game', {
+        partyId,
+        gameId,
+      });
     });
@@
-          io.to(getPartyRoom(partyId)).emit('party_message', {
-        roomId: partyId,
-        fromUserId: userId,
-        fromUserName: senderMeta.artistName || userId,
-        message,
-        timestamp: Date.now(),
-      });
+          io.to(getPartyRoom(partyId)).emit('party_message', {
+        roomId: partyId,
+        fromUserId: userId,
+        fromUserName: senderMeta.artistName || userId,
+        message,
+        timestamp: Date.now(),
+      });
     });
@@
-        if (queue.length >= 2) {
+        if (queue.length >= 2) {
         const player1 = queue.shift();
         const player2 = queue.shift();
         if (player1 && player2) {
           io.to(player1.userId).emit('match_found', {
             opponentId: player2.userId,
             gameId,
           });
           io.to(player2.userId).emit('match_found', {
             opponentId: player1.userId,
             gameId,
           });
         }
       }
     });
*** End Patch
