import sys

file_path = 'server/index.js'
with open(file_path, 'r') as f:
    content = f.read()

# Fix port binding
content = content.replace("server.listen(port, () => {", "server.listen(port, '0.0.0.0', () => {")

# Fix Socket.IO syntax
import re
# Ensure all handlers are closed and useuserInfo.socketId
content = content.replace('const targetSocketId = onlineUsers.get(toUserId);', 'const userInfo = onlineUsers.get(toUserId);')
content = content.replace('if (targetSocketId) {', 'if (userInfo) {')
content = content.replace('io.to(targetSocketId).emit', 'io.to(userInfo.socketId).emit')

# Check for missing }); in the handlers I saw in previous grep
# Specifically send_message and challenge_player
if 'io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });\n      }\n    });' not in content:
    content = content.replace('io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });\n      }\n    ',
                              'io.to(userInfo.socketId).emit("private_message", { fromUserId, fromUserName, message, timestamp: Date.now() });\n      }\n    });\n\n    ')

if 'io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });\n      }\n    });' not in content:
     content = content.replace('io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });\n      }\n    ',
                               'io.to(userInfo.socketId).emit("incoming_challenge", { fromUserId, gameId });\n      }\n    });\n\n    ')

with open(file_path, 'w') as f:
    f.write(content)
