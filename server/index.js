const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { Server } = require("socket.io");
require('dotenv').config();

// Environment Variable Validation
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'GEMINI_API_KEY'
];

const MISSING_VARS = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (MISSING_VARS.length > 0) {
  console.error('CRITICAL: Missing environment variables:', MISSING_VARS.join(', '));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'SMUVE_SALT_V4_SECURE_HASH';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://www.smuvejeffpresents.com';

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: [FRONTEND_ORIGIN, 'https://s-m-u-v-e-2-0-fixed.onrender.com', 'http://localhost:4200'],
  credentials: true
}));

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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const initDb = async () => {
  try {
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
        timestamp BIGINT,
        is_read BOOLEAN DEFAULT false
      );

      CREATE INDEX IF NOT EXISTS idx_direct_messages_users ON direct_messages(from_user_id, to_user_id);
    `);
    console.log("Elite database schema verified.");
  } catch (err) {
    console.error("Database initialization failure:", err);
  }
};

const sendSocialNotification = async (userId, subject, message) => {
  try {
    const { rows } = await pool.query("SELECT profile_data->>'email' as email FROM user_profiles WHERE user_id = $1", [userId]);
    const email = rows[0]?.email;
    if (!email || !process.env.SMTP_HOST) return;

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
      from: process.env.SMTP_FROM || '"S.M.U.V.E 2.0" <noreply@smuve.com>',
      to: email,
      subject: (process.env.SMTP_SUBJECT_PREFIX || 'S.M.U.V.E 2.0') + ': ' + subject,
      text: message,
    });
  } catch (err) {
    console.error("Email notification failure:", err);
  }
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'MOCK_KEY');

// --- SOCKET.IO LOGIC ---
const setupSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [FRONTEND_ORIGIN, 'https://s-m-u-v-e-2-0-fixed.onrender.com', 'http://localhost:4200'],
      methods: ["GET", "POST"]
    }
  });

  const getSenderFromSocket = (socket) => {
      const authHeader = socket.handshake.auth.token;
      if (!authHeader) return null;
      try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, JWT_SECRET);
          return decoded.userId;
      } catch (err) {
          return null;
      }
  };

  io.on('connection', (socket) => {
    console.log('Operative connected:', socket.id);

    socket.on('register_presence', async (data) => {
      const userId = getSenderFromSocket(socket);
      if (!userId) return;
      socket.join('user_' + userId);
      console.log('Presence registered for:', userId);
    });

    socket.on('join_room', (room) => {
      socket.join(room);
    });

    socket.on('send_room_message', (data) => {
      if (!data) return;
      const { room, message } = data;
      const userId = getSenderFromSocket(socket);
      if (!userId) return;
      io.to(room).emit('room_message', { from: userId, message, timestamp: Date.now() });
    });

    socket.on('send_message', async (data) => {
      const { toUserId, message } = data;
      const fromUserId = getSenderFromSocket(socket);
      if (!fromUserId) return;

      const timestamp = Date.now();
      try {
          await pool.query(
              'INSERT INTO direct_messages (from_user_id, to_user_id, message, timestamp) VALUES ($1, $2, $3, $4)',
              [fromUserId, toUserId, message, timestamp]
          );
          io.to('user_' + toUserId).emit('private_message', { fromUserId, message, timestamp });
      } catch (err) {
          console.error('DM Error:', err);
      }
    });

    socket.on('challenge_player', (data) => {
      const { toUserId, gameId } = data;
      const fromUserId = getSenderFromSocket(socket);
      if (!fromUserId) return;
      io.to('user_' + toUserId).emit('challenge_received', { fromUserId, gameId });
    });

    socket.on('disconnect', () => {
      console.log('Operative disconnected');
    });
  });
};

// --- ROUTES ---

// Profile Management
app.get('/api/profile/:userId', authenticateToken, authorizeUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query('SELECT profile_data FROM user_profiles WHERE user_id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }
    res.json(rows[0].profile_data);
  } catch (err) {
    console.error('Fetch Profile Error:', err);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

app.post('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { userId, profileData } = req.body;
    if (req.user.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized profile update.' });
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

// User Search & Discovery
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { q, location } = req.query;
    let query = `
      SELECT
        user_id as "userId",
        profile_data->>'artistName' as "artistName",
        profile_data->>'primaryGenre' as "primaryGenre",
        profile_data->>'avatarImage' as "avatarImage",
        profile_data->>'location' as "location",
        (profile_data->>'eliteScore')::int as "eliteScore",
        (profile_data->>'squadCount')::int as "squadCount"
      FROM user_profiles
      WHERE profile_data->>'profileSetupCompleted' = 'true'
      AND profile_data->>'artistName' != 'Incognito'
    `;
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
app.get('/api/users/:userId/messages/:friendId', authenticateToken, authorizeUser, async (req, res) => {
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
});

app.get('/api/users/:userId/friends', authenticateToken, authorizeUser, async (req, res) => {
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
});

app.post('/api/users/:userId/friends/:friendId', authenticateToken, authorizeUser, async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    if (userId === friendId) {
      return res.status(400).json({ error: 'Cannot friend yourself.' });
    }
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, friendId]
    );
    const { rows: userRows } = await pool.query("SELECT profile_data->>'artistName' as \"artistName\" FROM user_profiles WHERE user_id = $1", [userId]);
    const artistName = userRows[0]?.artistName || 'An operative';
    await sendSocialNotification(friendId, 'New Connection Request', artistName + " has linked with your executive profile on S.M.U.V.E 2.0.");
    res.json({ success: true });
  } catch (err) {
    console.error('Add Friend Error:', err);
    res.status(500).json({ error: 'Failed to add friend.' });
  }
});

app.patch('/api/users/:userId/friends/:friendId', authenticateToken, authorizeUser, async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    const { status } = req.body;

    const ALLOWED_STATUSES = ['pending', 'accepted', 'declined'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or declined.' });
    }

    if (status === 'declined') {
        await pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [friendId, userId]);
        await sendSocialNotification(friendId, 'Connection Update', "Your connection request to an operative has been declined.");
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

    const { rows: userRows } = await pool.query("SELECT profile_data->>'artistName' as \"artistName\" FROM user_profiles WHERE user_id = $1", [userId]);
    const artistName = userRows[0]?.artistName || 'An operative';
    await sendSocialNotification(friendId, 'Connection Approved', artistName + " has approved your connection request.");

    res.json({ success: true });
  } catch (err) {
    console.error('Update Friend Status Error:', err);
    res.status(500).json({ error: 'Failed to update connection status.' });
  }
});

app.delete('/api/users/:userId/friends/:friendId', authenticateToken, authorizeUser, async (req, res) => {
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
});

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
    const prompt = "Perform a deep creative audit for an artist with this profile: " + JSON.stringify(profileData) + " and current project status: " + JSON.stringify(projectSummary) + ". Provide 3 actionable strategic upgrades.";

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
    const prompt = "Act as an industry intelligence operative. Research and summarize the latest trends and opportunities for: " + query;

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
const PLATFORMS = ['twitch', 'youtube', 'discord', 'tiktok', 'instagram', 'kick', 'x'];

PLATFORMS.forEach(platform => {
  app.get('/api/auth/' + platform, (req, res) => {
    const clientId = process.env[platform.toUpperCase() + '_CLIENT_ID'] || 'MOCK_CLIENT_ID';
    const redirectUri = process.env[platform.toUpperCase() + '_REDIRECT_URI'] || "https://smuve-v4-backend-9951606049235487441.onrender.com/api/auth/" + platform + "/callback";

    let url = '';
    if (platform === 'twitch') {
      url = "https://id.twitch.tv/oauth2/authorize?client_id=" + clientId + "&redirect_uri=" + redirectUri + "&response_type=code&scope=user:read:email";
    } else if (platform === 'youtube') {
      url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + clientId + "&redirect_uri=" + redirectUri + "&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly";
    } else {
      url = redirectUri + "?code=MOCK_CODE_" + platform.toUpperCase();
    }
    res.redirect(url);
  });

  app.get('/api/auth/' + platform + '/callback', (req, res) => {
    const { code } = req.query;
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://www.smuvejeffpresents.com';
    const targetOrigin = frontendOrigin;
    const payload = JSON.stringify({ type: platform.toUpperCase() + "_AUTH_SUCCESS", code: code || null });
    const escapedPayload = payload.replace(/</g, '\\x3c').replace(/>/g, '\\x3e');
    res.send("<html><script>window.opener.postMessage(" + escapedPayload + ", " + JSON.stringify(targetOrigin) + "); window.close();</script></html>");
  });
});

const startEliteServer = async (port = process.env.PORT || 3000) => {
  await initDb();
  const server = http.createServer(app);
  setupSocketIO(server);
  await new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', (err) => {
      if (err) {
        reject(err);
      } else {
        console.log("S.M.U.V.E 2.0 Elite Server running on port " + port);
        resolve();
      }
    });
  });
  return server;
};

module.exports = {
  app,
  startServer: startEliteServer,
};

if (require.main === module) {
  void startEliteServer();
}
