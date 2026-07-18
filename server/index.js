const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
require('dotenv').config();

// Environment Variable Validation
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'GEMINI_API_KEY'];

console.log('STABILITY_CHECK: Verifying environment variables...');
const MISSING_VARS = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (MISSING_VARS.length > 0) {
  console.error(
    'CRITICAL_ERROR: Missing environment variables:',
    MISSING_VARS.join(', ')
  );
  MISSING_VARS.forEach((v) =>
    console.error(`DEPLOYMENT_BLOCKER: ${v} is not set in environment.`)
  );
  console.error(
    'APPLICATION_FATAL: Exiting due to missing production configuration.'
  );
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'SMUVE_SALT_V4_SECURE_HASH';
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'https://www.smuvejeffpresents.com';

// --- R2 STORAGE CONFIG ---
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({ storage: multer.memoryStorage() });
// ------------------------

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: [
      FRONTEND_ORIGIN,
      'https://s-m-u-v-e-2-0.onrender.com',
      'http://localhost:4200',
    ],
    credentials: true,
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  return next(err);
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

const isNonEmptyString = (val) =>
  typeof val === 'string' && val.trim().length > 0;

const authorizeUser = (req, res, next) => {
  const authenticatedUserId = req.user && req.user.userId;
  const requestedUserId = req.params.userId || req.body.userId;

  if (!isNonEmptyString(authenticatedUserId)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (
    !isNonEmptyString(requestedUserId) ||
    authenticatedUserId !== requestedUserId
  ) {
    return res
      .status(403)
      .json({ error: 'Access denied. Strategic breach detected.' });
  }
  next();
};

// --- DATABASE LOGIC ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const initDb = async () => {
  try {
    console.log('STABILITY_CHECK: Initializing database connection...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        profile_data JSONB DEFAULT '{}',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT,
        friend_id TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_id)
      );

      UPDATE friends
      SET status = 'pending'
      WHERE status IS NULL
         OR status NOT IN ('pending', 'accepted', 'declined');

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'friends_status_check'
        ) THEN
          ALTER TABLE friends
          ADD CONSTRAINT friends_status_check
          CHECK (status IN ('pending', 'accepted', 'declined'));
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS direct_messages (
        id SERIAL PRIMARY KEY,
        from_user_id TEXT,
        to_user_id TEXT,
        message TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_challenges (
        id SERIAL PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        from_user_name TEXT,
        to_user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_challenges_to_status ON game_challenges(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_challenges_from ON game_challenges(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_challenges_to_created ON game_challenges(to_user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        payload JSONB DEFAULT '{}',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);
    `);
    console.log('STABILITY_CHECK: Database initialized successfully.');
  } catch (err) {
    console.error(
      'CRITICAL_DATABASE_ERROR: Failed to initialize database:',
      err.message
    );
    if (process.env.NODE_ENV === 'production') {
      console.error('APPLICATION_FATAL: Exiting due to database failure.');
      process.exit(1);
    }
  }
};

// Socket.io Setup
const setupSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [
        FRONTEND_ORIGIN,
        'https://s-m-u-v-e-2-0.onrender.com',
        'http://localhost:4200',
      ],
      methods: ['GET', 'POST'],
    },
  });

  // Module-level reference so REST endpoints can broadcast via Socket.io
let appIO = null;

// In-memory state for real-time social features
  const presence = new Map(); // userId -> { socketId, metadata }
  const rooms = new Map(); // roomId -> Set<userId>
  const parties = new Map(); // partyId -> { leaderId, members: [{userId, artistName}], gameId }
  const matchmakingQueues = new Map(); // gameId -> [{userId, socketId, timestamp}]

  const getSenderFromSocket = (socket) => {
    try {
      // Support token in handshake.auth (Socket.io client) or Authorization header
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers['authorization'] || '').split(' ')[1];
      if (!token) return null;
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return null;
    }
  };

  const broadcastOnlineUsers = () => {
    const users = Array.from(presence.entries()).map(([userId, data]) => ({
      userId,
      ...data.metadata,
      online: true,
    }));
    io.emit('users_online', users);
  };

  const getPartyRoom = (partyId) => `party:${partyId}`;

  io.on('connection', (socket) => {
    const user = getSenderFromSocket(socket);
    if (!user) {
      socket.disconnect();
      return;
    }

    const userId = user.userId;
    socket.join(userId);

    // --- Presence ---
    socket.on('register_presence', async (data = {}) => {
      const metadata = data.metadata || {};
      presence.set(userId, { socketId: socket.id, metadata });
      broadcastOnlineUsers();
      // Auto-deliver pending challenges + unread notifications on reconnect
      try {
        await pool.query(
          `UPDATE game_challenges
           SET status = 'expired', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'pending' AND to_user_id = $1 AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
          [userId]
        );
        const { rows: chalRows } = await pool.query(
          `SELECT id, from_user_id, from_user_name, to_user_id, game_id, message, status, EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
           FROM game_challenges
           WHERE (to_user_id = $1 OR from_user_id = $1)
             AND created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days')
           ORDER BY created_at DESC LIMIT 50`,
          [userId]
        );
        const challenges = chalRows.map((r) => ({
          id: Number(r.id),
          fromUserId: r.from_user_id,
          fromUserName: r.from_user_name,
          toUserId: r.to_user_id,
          gameId: r.game_id,
          message: r.message,
          status: r.status,
          timestamp: Number(r.timestamp),
        }));
        io.to(userId).emit('challenge_inbox_sync', challenges);
        const { rows: notifRows } = await pool.query(
          `SELECT id, type, title, body, payload, is_read, EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 30`,
          [userId]
        );
        const notifications = notifRows.map((r) => ({
          id: Number(r.id),
          type: r.type,
          title: r.title,
          body: r.body,
          payload: r.payload || {},
          read: r.is_read,
          timestamp: Number(r.timestamp),
        }));
        io.to(userId).emit('notification_sync', notifications);
      } catch (err) {
        console.error('Auto-sync error on register_presence:', err);
      }
    });

    socket.on('update_status', (data = {}) => {
      const current = presence.get(userId);
      if (current) {
        current.metadata = { ...current.metadata, ...(data.metadata || {}) };
        broadcastOnlineUsers();
      }
    });

    // --- Rooms ---
    socket.on('join_room', (roomId) => {
      if (!roomId) return;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(userId);
      socket.join(roomId);
    });

    socket.on('send_room_message', (data = {}) => {
      const { roomId, message, fromUserName } = data;
      if (!roomId || !message) return;
      const payload = {
        roomId,
        fromUserId: userId,
        fromUserName: fromUserName || userId,
        message,
        timestamp: Date.now(),
      };
      io.to(roomId).emit('room_message', payload);
    });

    // --- Private Messages ---
    socket.on('send_message', async (data = {}) => {
      const { toUserId, message } = data;
      if (!toUserId || !message) return;
      try {
        await pool.query(
          'INSERT INTO direct_messages (from_user_id, to_user_id, message) VALUES ($1, $2, $3)',
          [userId, toUserId, message]
        );
        const payload = {
          fromUserId: userId,
          toUserId,
          message,
          timestamp: Date.now(),
        };
        io.to(toUserId).emit('private_message', payload);
        // Also emit to sender for local echo consistency
        io.to(userId).emit('private_message', payload);
      } catch (err) {
        console.error('DM Error:', err);
      }
    });

    // --- Typing Indicators ---
    socket.on('typing', (data = {}) => {
      const { toUserId, isTyping } = data;
      if (!toUserId) return;
      io.to(toUserId).emit('user_typing', {
        fromUserId: userId,
        isTyping: !!isTyping,
      });
    });

    // --- Challenges (persisted, offline notifications) ---
    socket.on('challenge_player', async (data = {}) => {
      const { toUserId, gameId, message } = data;
      if (!toUserId || !gameId) return;
      const fromUserName = presence.get(userId)?.metadata?.artistName || userId;
      try {
        const { rows } = await pool.query(
          `INSERT INTO game_challenges (from_user_id, from_user_name, to_user_id, game_id, message, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id, from_user_id, from_user_name, to_user_id, game_id, message, status, created_at`,
          [userId, fromUserName, toUserId, gameId, message || null]
        );
        const record = {
          id: rows[0].id,
          fromUserId: rows[0].from_user_id,
          fromUserName: rows[0].from_user_name,
          toUserId: rows[0].to_user_id,
          gameId: rows[0].game_id,
          message: rows[0].message,
          status: rows[0].status,
          timestamp: new Date(rows[0].created_at).getTime(),
        };
        const isOnline = presence.has(toUserId);
        // Always write a notification record (covers both online + offline cases)
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, payload)
           VALUES ($1, 'challenge_incoming', $2, $3, $4)`,
          [
            toUserId,
            '🎮 Game Challenge',
            `${fromUserName} challenged you to ${gameId}`,
            JSON.stringify({ challengeId: record.id, fromUserId: userId, gameId }),
          ]
        );
        if (isOnline) {
          io.to(toUserId).emit('incoming_challenge', record);
        } else {
          // Offline target: email via existing nodemailer helper
          await sendSocialNotification(
            toUserId,
            '🎮 SMUVE Challenge',
            `${fromUserName} challenged you to ${gameId} on S.M.U.V.E. 2.0.\n` +
              `Open the app to accept or decline: https://smuvejeffpresents.com/inbox`
          );
        }
        // Acknowledge sender
        io.to(userId).emit('challenge_persisted', record);
      } catch (err) {
        console.error('Challenge persist error:', err);
      }
    });

    // --- Inbox sync on reconnect ---
    socket.on('request_inbox_sync', async () => {
      try {
        // Lazy-expire pending challenges older than 7 days
        await pool.query(
          `UPDATE game_challenges
           SET status = 'expired', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'pending' AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`
        );
        const { rows: chalRows } = await pool.query(
          `SELECT id, from_user_id, from_user_name, to_user_id, game_id, message, status, EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
           FROM game_challenges
           WHERE to_user_id = $1 OR from_user_id = $1
           ORDER BY created_at DESC LIMIT 50`,
          [userId]
        );
        const challenges = chalRows.map((r) => ({
          id: Number(r.id),
          fromUserId: r.from_user_id,
          fromUserName: r.from_user_name,
          toUserId: r.to_user_id,
          gameId: r.game_id,
          message: r.message,
          status: r.status,
          timestamp: Number(r.timestamp),
        }));
        io.to(userId).emit('challenge_inbox_sync', challenges);
        const { rows: notifRows } = await pool.query(
          `SELECT id, type, title, body, payload, is_read, EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 30`,
          [userId]
        );
        const notifications = notifRows.map((r) => ({
          id: Number(r.id),
          type: r.type,
          title: r.title,
          body: r.body,
          payload: r.payload || {},
          read: r.is_read,
          timestamp: Number(r.timestamp),
        }));
        io.to(userId).emit('notification_sync', notifications);
      } catch (err) {
        console.error('Inbox sync error:', err);
      }
    });

    // --- Voice Signaling (WebRTC relay) ---
    socket.on('voice_signal', (data = {}) => {
      const { toUserId, signal } = data;
      if (!toUserId || !signal) return;
      io.to(toUserId).emit('voice_signal', {
        fromUserId: userId,
        signal,
      });
    });

    // --- Parties / Squads ---
    socket.on('create_party', (data = {}) => {
      const partyId = data.partyId || `party_${crypto.randomUUID()}`;
      const leaderMeta = presence.get(userId)?.metadata || {};
      parties.set(partyId, {
        leaderId: userId,
        members: [{ userId, artistName: leaderMeta.artistName || userId }],
        gameId: data.gameId || 'global',
      });
      socket.join(getPartyRoom(partyId));
      io.to(userId).emit('party_created', {
        partyId,
        leaderId: userId,
        members: [{ userId, artistName: leaderMeta.artistName || userId }],
      });
    });

    socket.on('invite_to_party', (data = {}) => {
      const { toUserId, partyId, gameId } = data;
      if (!toUserId || !partyId) return;
      const party = parties.get(partyId);
      if (!party) return;
      const inviterMeta = presence.get(userId)?.metadata || {};
      io.to(toUserId).emit('party_invite', {
        fromUserId: userId,
        fromUserName: inviterMeta.artistName || userId,
        partyId,
        gameId: gameId || party.gameId,
      });
    });

    socket.on('join_party', (data = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      const party = parties.get(partyId);
      if (!party) return;
      const memberMeta = presence.get(userId)?.metadata || {};
      if (!party.members.find((m) => m.userId === userId)) {
        party.members.push({
          userId,
          artistName: memberMeta.artistName || userId,
        });
      }
      socket.join(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit('user_joined_party', {
        userId,
        artistName: memberMeta.artistName || userId,
      });
    });

    socket.on('leave_party', (data = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      const party = parties.get(partyId);
      if (party) {
        party.members = party.members.filter((m) => m.userId !== userId);
        if (party.members.length === 0) {
          parties.delete(partyId);
        }
      }
      socket.leave(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit('user_left_party', { userId });
    });

    socket.on('party_launch_game', (data = {}) => {
      const { partyId, gameId } = data;
      if (!partyId || !gameId) return;
      const party = parties.get(partyId);
      if (!party || party.leaderId !== userId) return;
      io.to(getPartyRoom(partyId)).emit('party_launch_game', { partyId, gameId });
    });

    socket.on('send_party_message', (data = {}) => {
      const { partyId, message } = data;
      if (!partyId || !message) return;
      const senderMeta = presence.get(userId)?.metadata || {};
      io.to(getPartyRoom(partyId)).emit('party_message', {
        roomId: partyId,
        fromUserId: userId,
        fromUserName: senderMeta.artistName || userId,
        message,
        timestamp: Date.now(),
      });
    });

    // --- Matchmaking ---
    socket.on('queue_for_match', (data = {}) => {
      const { gameId } = data;
      if (!gameId) return;
      if (!matchmakingQueues.has(gameId)) {
        matchmakingQueues.set(gameId, []);
      }
      const queue = matchmakingQueues.get(gameId);
      // Prevent duplicate entries
      if (!queue.find((q) => q.userId === userId)) {
        queue.push({ userId, socketId: socket.id, timestamp: Date.now() });
      }
      // Simple FIFO matching: if 2+ players, match them
      if (queue.length >= 2) {
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

    socket.on('cancel_match', (data = {}) => {
      const { gameId } = data;
      if (!gameId) return;
      const queue = matchmakingQueues.get(gameId);
      if (queue) {
        matchmakingQueues.set(
          gameId,
          queue.filter((q) => q.userId !== userId)
        );
      }
    });

    // --- Neural Sync ---
    socket.on('neural_sync_request', (data = {}) => {
      const { toUserId, syncType } = data;
      if (!toUserId) return;
      const senderMeta = presence.get(userId)?.metadata || {};
      io.to(toUserId).emit('neural_sync_invite', {
        fromUserId: userId,
        fromUserName: senderMeta.artistName || userId,
        syncType: syncType || 'FULL_DASHBOARD',
      });
    });

    socket.on('neural_sync_approve', (data = {}) => {
      const { toUserId, syncData } = data;
      if (!toUserId) return;
      const senderMeta = presence.get(userId)?.metadata || {};
      io.to(toUserId).emit('neural_sync_complete', {
        fromUserId: userId,
        fromUserName: senderMeta.artistName || userId,
        syncData,
      });
    });

    // --- Legacy squad handler (kept for compatibility) ---
    socket.on('INITIALIZE_SQUAD', (data = {}) => {
      const squadId = `squad_${crypto.randomUUID()}`;
      socket.join(squadId);
      io.to(userId).emit('SQUAD_CREATED', { squadId, members: [userId] });
    });

    socket.on('SEND_DIRECT_MESSAGE', async (data = {}) => {
      const { toUserId, message } = data;
      if (!toUserId || !message) return;
      try {
        await pool.query(
          'INSERT INTO direct_messages (from_user_id, to_user_id, message) VALUES ($1, $2, $3)',
          [userId, toUserId, message]
        );
        io.to(toUserId).emit('RECEIVE_DIRECT_MESSAGE', {
          fromUserId: userId,
          message,
          timestamp: new Date(),
        });
      } catch (err) {
        console.error('DM Error:', err);
      }
    });

    socket.on('disconnect', () => {
      presence.delete(userId);
      // Remove from all matchmaking queues
      matchmakingQueues.forEach((queue, gameId) => {
        matchmakingQueues.set(
          gameId,
          queue.filter((q) => q.userId !== userId)
        );
      });
      broadcastOnlineUsers();
    });
  });
  appIO = io;
  return io;
};

const sendSocialNotification = async (userId, title, body) => {
  try {
    const { rows } = await pool.query(
      "SELECT profile_data->>'email' as email FROM user_profiles WHERE user_id = $1",
      [userId]
    );
    const email = rows[0]?.email;

    if (email && process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: '"S.M.U.V.E 2.0" <no-reply@smuve.com>',
        to: email,
        subject: title,
        text: body,
      });
    }
  } catch (err) {
    console.error('Notification Error:', err);
  }
};

// AI SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'MOCK_KEY');

// REST Endpoints

app.post(
  '/api/upload',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const userId = req.user.userId;
      const fileName = `${userId}_${Date.now()}_${req.file.originalname}`;
      const bucketName = process.env.R2_BUCKET_NAME;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });

      await s3Client.send(command);

      const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
      res.json({ url: publicUrl });
    } catch (err) {
      console.error('R2 Upload Error:', err);
      res.status(500).json({ error: 'Failed to upload asset to storage.' });
    }
  }
);

app.get(
  '/api/profile/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT profile_data FROM user_profiles WHERE user_id = $1',
        [userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found.' });
      }
      res.json(rows[0].profile_data);
    } catch (err) {
      console.error('Fetch Profile Error:', err);
      res.status(500).json({ error: 'Failed to fetch profile.' });
    }
  }
);

app.post('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { userId, profileData } = req.body;
    if (!userId || !profileData) {
      return res.status(400).json({ error: 'Missing userId or profileData.' });
    }
    const authUser = req.user.userId;
    if (authUser !== userId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await pool.query(
      'INSERT INTO user_profiles (user_id, profile_data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET profile_data = $2, updated_at = CURRENT_TIMESTAMP',
      [userId, profileData]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Save Profile Error:', err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { q, location } = req.query;
    let query = `SELECT user_id as "userId", profile_data->>'artistName' as "artistName", profile_data->>'primaryGenre' as "primaryGenre", profile_data->>'avatarImage' as "avatarImage", profile_data->>'location' as "location" FROM user_profiles WHERE 1=1`;
    const params = [];

    if (q && typeof q === 'string') {
      params.push('%' + q + '%');
      query += ` AND (profile_data->>'artistName' ILIKE $1 OR profile_data->>'primaryGenre' ILIKE $1)`;
    }

    if (location && typeof location === 'string') {
      const paramIdx = params.length + 1;
      params.push('%' + location + '%');
      query += ` AND profile_data->>'location' ILIKE $` + paramIdx;
    }

    query += ` ORDER BY (profile_data->>'eliteScore')::int DESC NULLS LAST LIMIT 20`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).json({ error: 'Failed to search users.' });
  }
});

app.get('/api/users/featured', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        user_id as "userId",
        profile_data->>'artistName' as "artistName",
        profile_data->>'primaryGenre' as "primaryGenre",
        profile_data->>'avatarImage' as "avatarImage",
        profile_data->>'location' as "location",
        (profile_data->>'profileSetupCompleted')::boolean as "profileSetupCompleted"
       FROM user_profiles
       WHERE profile_data->>'profileSetupCompleted' = 'true'
       AND profile_data->>'artistName' != 'Incognito'
       ORDER BY updated_at DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    console.error('Featured Users Error:', err);
    res.status(500).json({ error: 'Failed to fetch featured users.' });
  }
});

// Friends & Messages
app.get(
  '/api/users/:userId/messages/:friendId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, friendId } = req.params;
      const { rows } = await pool.query(
        `SELECT from_user_id as "fromUserId", to_user_id as "toUserId", message, timestamp
       FROM direct_messages
       WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
       ORDER BY timestamp ASC LIMIT 100`,
        [userId, friendId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Fetch DMs Error:', err);
      res.status(500).json({ error: 'Failed to fetch message history.' });
    }
  }
);

app.get(
  '/api/users/:userId/friends',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        `SELECT
        u.user_id as "userId",
        u.profile_data->>'artistName' as "artistName",
        u.profile_data->>'primaryGenre' as "primaryGenre",
        u.profile_data->>'avatarImage' as "avatarImage",
        u.profile_data->>'location' as "location",
        f.status as "status"
       FROM friends f
       JOIN user_profiles u ON f.friend_id = u.user_id
       WHERE f.user_id = $1`,
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Friends List Error:', err);
      res.status(500).json({ error: 'Failed to fetch friends list.' });
    }
  }
);

app.post(
  '/api/users/:userId/friends/:friendId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, friendId } = req.params;
      if (userId === friendId) {
        return res.status(400).json({ error: 'Cannot friend yourself.' });
      }
      await pool.query(
        'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, friendId]
      );
      const { rows: userRows } = await pool.query(
        'SELECT profile_data->>\'artistName\' as "artistName" FROM user_profiles WHERE user_id = $1',
        [userId]
      );
      const artistName = userRows[0]?.artistName || 'An operative';
      await sendSocialNotification(
        friendId,
        'New Connection Request',
        artistName + ' has linked with your executive profile on S.M.U.V.E 2.0.'
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Add Friend Error:', err);
      res.status(500).json({ error: 'Failed to add friend.' });
    }
  }
);

app.patch(
  '/api/users/:userId/friends/:friendId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, friendId } = req.params;
      const { status } = req.body;

      const ALLOWED_STATUSES = ['pending', 'accepted', 'declined'];
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status. Must be pending, accepted, or declined.',
        });
      }

      if (status === 'declined') {
        await pool.query(
          'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
          [friendId, userId]
        );
        await sendSocialNotification(
          friendId,
          'Connection Update',
          'Your connection request to an operative has been declined.'
        );
        return res.json({ success: true, message: 'Connection declined.' });
      }

      await pool.query(
        'UPDATE friends SET status = $1 WHERE user_id = $2 AND friend_id = $3',
        [status, friendId, userId]
      );

      await pool.query(
        'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = $3',
        [userId, friendId, status]
      );

      const { rows: userRows } = await pool.query(
        'SELECT profile_data->>\'artistName\' as "artistName" FROM user_profiles WHERE user_id = $1',
        [userId]
      );
      const artistName = userRows[0]?.artistName || 'An operative';
      await sendSocialNotification(
        friendId,
        'Connection Approved',
        artistName + ' has approved your connection request.'
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Update Friend Status Error:', err);
      res.status(500).json({ error: 'Failed to update connection status.' });
    }
  }
);

app.delete(
  '/api/users/:userId/friends/:friendId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, friendId } = req.params;
      await pool.query(
        'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
        [userId, friendId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Remove Friend Error:', err);
      res.status(500).json({ error: 'Failed to remove friend.' });
    }
  }
);

// --- CHALLENGE INBOX (persisted multiplayer state) ---
app.get(
  '/api/users/:userId/challenges',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const status = (req.query.status || 'all').toString();
      // Lazy-expire pending > 7 days
      await pool.query(
        `UPDATE game_challenges
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'pending' AND to_user_id = $1 AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
        [userId]
      );
      let query =
        `SELECT id, from_user_id, from_user_name, to_user_id, game_id, message, status,
                EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
         FROM game_challenges
         WHERE (to_user_id = $1 OR from_user_id = $1)`;
      const params = [userId];
      if (['pending', 'accepted', 'declined', 'expired'].includes(status)) {
        query += ` AND status = $2`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC LIMIT 50`;
      const { rows } = await pool.query(query, params);
      res.json(
        rows.map((r) => ({
          id: Number(r.id),
          fromUserId: r.from_user_id,
          fromUserName: r.from_user_name,
          toUserId: r.to_user_id,
          gameId: r.game_id,
          message: r.message,
          status: r.status,
          timestamp: Number(r.timestamp),
        }))
      );
    } catch (err) {
      console.error('Challenge inbox error:', err);
      res.status(500).json({ error: 'Failed to load challenge inbox.' });
    }
  }
);

app.post(
  '/api/users/:userId/challenges/:challengeId/respond',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, challengeId } = req.params;
      const newStatus = (req.body && req.body.status) || '';
      if (!['accepted', 'declined'].includes(newStatus)) {
        return res
          .status(400)
          .json({ error: 'status must be accepted or declined' });
      }
      const { rows } = await pool.query(
        `UPDATE game_challenges
         SET status = $1, updated_at = CURRENT_TIMESTAMP, responded_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND to_user_id = $3
         RETURNING id, from_user_id, from_user_name, to_user_id, game_id, message, status,
                   EXTRACT(EPOCH FROM responded_at)::bigint * 1000 as timestamp`,
        [newStatus, challengeId, userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Challenge not found.' });
      }
      const updated = rows[0];
      // Notify the challenger via socket if online
      if (appIO) {
        appIO
          .to(updated.from_user_id)
        .emit('challenge_response', {
          id: Number(updated.id),
          responderId: userId,
          gameId: updated.game_id,
          status: updated.status,
          timestamp: Number(updated.timestamp),
        });
      }
      res.json({ success: true, challenge: { ...updated, id: Number(updated.id) } });
    } catch (err) {
      console.error('Respond challenge error:', err);
      res.status(500).json({ error: 'Failed to respond to challenge.' });
    }
  }
);

// --- NOTIFICATIONS ---
app.get(
  '/api/users/:userId/notifications',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const unreadOnly = req.query.unreadOnly === 'true';
      let query = `SELECT id, type, title, body, payload, is_read, EXTRACT(EPOCH FROM created_at)::bigint * 1000 as timestamp
                   FROM notifications WHERE user_id = $1`;
      const params = [userId];
      if (unreadOnly) {
        query += ` AND is_read = FALSE`;
      }
      query += ` ORDER BY created_at DESC LIMIT 50`;
      const { rows } = await pool.query(query, params);
      res.json(
        rows.map((r) => ({
          id: Number(r.id),
          type: r.type,
          title: r.title,
          body: r.body,
          payload: r.payload || {},
          read: r.is_read,
          timestamp: Number(r.timestamp),
        }))
      );
    } catch (err) {
      console.error('Notifications list error:', err);
      res.status(500).json({ error: 'Failed to load notifications.' });
    }
  }
);

app.post(
  '/api/users/:userId/notifications/:notifId/read',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, notifId } = req.params;
      await pool.query(
        `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
        [notifId, userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Mark read error:', err);
      res.status(500).json({ error: 'Failed to mark notification read.' });
    }
  }
);

// AI & Analysis Endpoints
app.post('/api/ai/analyze', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ text: response.text() });
  } catch (err) {
    console.error('AI Analysis Error:', err);
    res.status(500).json({ error: 'Failed to analyze content.' });
  }
});

app.post('/api/ai/deep-audit', authenticateToken, async (req, res) => {
  try {
    const { profileData, projectSummary } = req.body;
    const prompt =
      'Perform a deep creative audit for an artist with this profile: ' +
      JSON.stringify(profileData) +
      ' and current project status: ' +
      JSON.stringify(projectSummary) +
      '. Provide 3 actionable strategic upgrades.';

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ audit: response.text() });
  } catch (err) {
    console.error('Deep Audit Error:', err);
    res.status(500).json({ error: 'Failed to perform deep audit.' });
  }
});

app.post('/api/ai/industry-search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.body;
    const prompt =
      'Act as an industry intelligence operative. Research and summarize the latest trends and opportunities for: ' +
      query;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ intelligence: response.text() });
  } catch (err) {
    console.error('Industry Search Error:', err);
    res.status(500).json({ error: 'Failed to gather industry intelligence.' });
  }
});

// Multi-Platform OAuth Scaffolds
const PLATFORMS = [
  'twitch',
  'youtube',
  'discord',
  'tiktok',
  'instagram',
  'kick',
  'x',
];

PLATFORMS.forEach((platform) => {
  app.get('/api/auth/' + platform, (req, res) => {
    const clientId =
      process.env[platform.toUpperCase() + '_CLIENT_ID'] || 'MOCK_CLIENT_ID';
    const redirectUri =
      process.env[platform.toUpperCase() + '_REDIRECT_URI'] ||
      'https://smuve-v4-backend-9951606049235487441.onrender.com/api/auth/' +
        platform +
        '/callback';

    let url = '';
    if (platform === 'twitch') {
      url =
        'https://id.twitch.tv/oauth2/authorize?client_id=' +
        clientId +
        '&redirect_uri=' +
        redirectUri +
        '&response_type=code&scope=user:read:email';
    } else if (platform === 'youtube') {
      url =
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=' +
        clientId +
        '&redirect_uri=' +
        redirectUri +
        '&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly';
    } else {
      url = redirectUri + '?code=MOCK_CODE_' + platform.toUpperCase();
    }
    res.redirect(url);
  });

  app.get('/api/auth/' + platform + '/callback', (req, res) => {
    const { code } = req.query;
    const frontendOrigin =
      process.env.FRONTEND_ORIGIN || 'https://www.smuvejeffpresents.com';
    const targetOrigin = frontendOrigin;
    const payload = JSON.stringify({
      type: platform.toUpperCase() + '_AUTH_SUCCESS',
      code: code || null,
    });
    const escapedPayload = payload
      .replace(/</g, '\\x3c')
      .replace(/>/g, '\\x3e');
    res.send(
      '<html><script>window.opener.postMessage(' +
        escapedPayload +
        ', ' +
        JSON.stringify(targetOrigin) +
        '); window.close();</script></html>'
    );
  });
});

const startEliteServer = async (port = process.env.PORT || 3000) => {
  try {
    console.log(`STABILITY_CHECK: Starting Elite Server on port ${port}...`);
    await initDb();
    const server = http.createServer(app);
    setupSocketIO(server);

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        console.error(
          'CRITICAL_RUNTIME_ERROR: Server error event:',
          err.message
        );
        reject(err);
      });

      server.listen(port, '0.0.0.0', () => {
        console.log('S.M.U.V.E 2.0 Elite Server running on port ' + port);
        resolve(server);
      });
    });
  } catch (err) {
    console.error(
      'CRITICAL_STARTUP_ERROR: Failed to start server:',
      err.message
    );
    if (process.env.NODE_ENV === 'production') {
      console.error('APPLICATION_FATAL: Exiting due to startup failure.');
      process.exit(1);
    }
  }
};

module.exports = {
  app,
  startServer: startEliteServer,
};

if (require.main === module) {
  void startEliteServer();
}
