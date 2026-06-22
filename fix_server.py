import sys

with open('server/index.js', 'r') as f:
    content = f.read()

start_marker = 'const setupSocketIO = (server) => {'
end_marker = 'return io;\n};'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    end_idx += len(end_marker)
    setup_block = """const setupSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const onlineUsers = new Map(); // userId -> { socketId, metadata }

  const broadcastOnlineUsers = () => {
    const users = Array.from(onlineUsers.entries()).map(([userId, info]) => ({
      userId,
      ...info.metadata
    }));
    io.emit("users_online", users);
  };

  io.on("connection", (socket) => {
    console.log("Elite user connected:", socket.id);

    socket.on("register_presence", (data) => {
      const userId = typeof data === "string" ? data : data.userId;
      const metadata = typeof data === "string" ? {} : data.metadata;
      onlineUsers.set(userId, { socketId: socket.id, metadata });
      broadcastOnlineUsers();
      console.log(`User ${userId} registered with metadata.`);
    });

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("send_room_message", (data) => {
      const { roomId, message, fromUserId, fromUserName } = data;
      io.to(roomId).emit("room_message", { roomId, fromUserId, fromUserName, message, timestamp: Date.now() });
    });

    socket.on("send_message", (data) => {
      const { toUserId, message, fromUserId, fromUserName } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });
      }
    });

    socket.on("challenge_player", (data) => {
      const { toUserId, fromUserId, gameId } = data;
      const userInfo = onlineUsers.get(toUserId);
      if (userInfo) {
        io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });
      }
    });

    socket.on("disconnect", () => {
      for (const [userId, info] of onlineUsers.entries()) {
        if (info.socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      broadcastOnlineUsers();
      console.log("Elite user disconnected:", socket.id);
    });
  });

  return io;
};"""
    new_content = content[:start_idx] + setup_block + content[end_idx:]
    with open('server/index.js', 'w') as f:
        f.write(new_content)
    print("Successfully fixed server/index.js")
else:
    print(f"Markers not found: start={start_idx}, end={end_idx}")
    sys.exit(1)
