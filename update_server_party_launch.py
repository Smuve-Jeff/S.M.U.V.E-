import os

with open('server/index.js', 'r') as f:
    content = f.read()

party_launch_socket = """
    socket.on("party_launch_game", (data) => {
      const { partyId, gameId } = data;
      io.to(`party_${partyId}`).emit("party_launch_game", { partyId, gameId });
      console.log(`Party ${partyId} launching game ${gameId}`);
    });
"""

if 'party_launch_game' not in content:
    content = content.replace('socket.on("send_party_message", (data) => {', party_launch_socket + '\n    socket.on("send_party_message", (data) => {')

with open('server/index.js', 'w') as f:
    f.write(content)
