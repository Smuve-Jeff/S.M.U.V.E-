import sys

with open('server/index.js', 'r') as f:
    content = f.read()

# Fix the missing closing braces/parens in the socket handlers
old_send = """    socket.on("send_message", (data) => {
      const { toUserId, message, fromUserId, fromUserName } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });
      }
    socket.on("challenge_player\""""

new_send = """    socket.on("send_message", (data) => {
      const { toUserId, message, fromUserId, fromUserName } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });
      }
    });

    socket.on("challenge_player\""""

if old_send in content:
    content = content.replace(old_send, new_send)
    with open('server/index.js', 'w') as f:
        f.write(content)
    print("Fixed send_message handler closing")
else:
    # Try a slightly different match if needed, but based on previous grep it looks like this.
    print("Could not find the exact broken block for send_message")

with open('server/index.js', 'r') as f:
    content = f.read()

old_challenge = """    socket.on("challenge_player", (data) => {
      const { toUserId, fromUserId, gameId } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });
      }
    socket.on("disconnect\""""

new_challenge = """    socket.on("challenge_player", (data) => {
      const { toUserId, fromUserId, gameId } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });
      }
    });

    socket.on("disconnect\""""

if old_challenge in content:
    content = content.replace(old_challenge, new_challenge)
    with open('server/index.js', 'w') as f:
        f.write(content)
    print("Fixed challenge_player handler closing")
else:
    print("Could not find the exact broken block for challenge_player")
