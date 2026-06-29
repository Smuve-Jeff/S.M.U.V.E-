import os

with open('src/app/services/social-networking.service.ts', 'r') as f:
    content = f.read()

# Add party launch socket listeners
party_launch_listeners = """
    this.socket.on("party_launch_game", (data: any) => {
      this.roomMessages.update(msgs => [...msgs, {
          roomId: 'party',
          fromUserId: 'system',
          fromUserName: 'SQUAD_COMMAND',
          message: `SQUAD_LEADER_LAUNCHING: ${data.gameId.toUpperCase()}. PREPARE_FOR_JOINT_MISSION.`,
          timestamp: Date.now(),
          metadata: { type: 'GAME_INVITE', gameId: data.gameId }
      }]);
    });
"""

if 'party_launch_game' not in content:
    content = content.replace('this.socket.on("party_message", (data: any) => {', party_launch_listeners + '\n    this.socket.on("party_message", (data: any) => {')

# Add launchPartyGame method
launch_method = """
  launchPartyGame(gameId: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit("party_launch_game", { partyId, gameId });
  }
"""

if 'launchPartyGame' not in content:
    content = content.replace('sendPartyMessage(message: string) {', launch_method + '\n  sendPartyMessage(message: string) {')

with open('src/app/services/social-networking.service.ts', 'w') as f:
    f.write(content)
