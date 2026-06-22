import sys

file_path = 'server/index.js'
with open(file_path, 'r') as f:
    content = f.read()

# Fix send_message
old_send = 'const targetSocketId = onlineUsers.get(toUserId);\n      if (targetSocketId) {\n        io.to(targetSocketId).emit("private_message"'
new_send = 'const userInfo = onlineUsers.get(toUserId);\n      if (userInfo) {\n        io.to(userInfo.socketId).emit("private_message"'

if old_send in content:
    content = content.replace(old_send, new_send)
    print("Fixed send_message target")

# Fix challenge_player
old_challenge = 'const targetSocketId = onlineUsers.get(toUserId);\n      if (targetSocketId) {\n        io.to(targetSocketId).emit("incoming_challenge"'
new_challenge = 'const userInfo = onlineUsers.get(toUserId);\n      if (userInfo) {\n        io.to(userInfo.socketId).emit("incoming_challenge"'

if old_challenge in content:
    content = content.replace(old_challenge, new_challenge)
    print("Fixed challenge_player target")

with open(file_path, 'w') as f:
    f.write(content)
