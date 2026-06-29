const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length === 0) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}
const app = express();
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  return next(err);
});

// Rate Limiting
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
const isObject = (val) => typeof val === 'object' && val !== null;

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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Increased for Studio syncing
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);


const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again later.' },
});

const aiAnalyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Try again later.' },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isValidEmail = (email = '') => {
  const normalized = String(email).trim();
  if (!normalized || normalized.length > 254 || normalized.includes(' ')) {
    return false;
  }

  const atIndex = normalized.indexOf('@');
  if (
    atIndex <= 0 ||
    atIndex !== normalized.lastIndexOf('@') ||
    atIndex === normalized.length - 1
  ) {
    return false;
  }

  const localPart = normalized.slice(0, atIndex);
  const domainPart = normalized.slice(atIndex + 1);
  const domainLabels = domainPart.split('.');

  if (
    !localPart ||
    domainLabels.length < 2 ||
    domainLabels.some((label) => !label.length)
  ) {
    return false;
  }

  return true;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
};

const createEmailTransport = () => {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;

  if (!host || !from) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const auth =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });
};

async function sendSocialNotification(userId, title, body) {
  const { rows } = await pool.query("SELECT profile_data->>'email' as email FROM user_profiles WHERE user_id = $1", [userId]);
  const email = rows[0]?.email;
  if (!email) return;

  const transport = createEmailTransport();
  if (!transport) return;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `[S.M.U.V.E 2.0] ${title}`,
      text: body,
    });
  } catch (err) {
    console.error('Failed to send social notification email:', err);
  }

const formatLoginTimestamp = (input) => {
  const parsed = input ? new Date(input) : new Date();
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
};

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id VARCHAR(255) PRIMARY KEY,
        profile_data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        project_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        project_data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS security_logs (
        log_id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        device_name VARCHAR(255),
        location VARCHAR(255),
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artist_identities (
        user_id VARCHAR(255) PRIMARY KEY,
        identity_data JSONB NOT NULL,
        profile_snapshot JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS connector_jobs (
        job_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        connector_id VARCHAR(80) NOT NULL,
        status VARCHAR(20) NOT NULL,
        trigger_type VARCHAR(20) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
      );
    `);
    console.log(
      'Database initialized with security, project, and identity support'
    );
  } catch (err) {
    console.error('Error initializing database', err);
  }
};

// Profile Endpoints
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
      if (rows.length > 0) {
        res.json(rows[0].profile_data);
      } else {
        res.status(404).json({ error: 'Profile not found' });
      }
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post('/api/profile', authenticateToken, authorizeUser, async (req, res) => {
  if (!isNonEmptyString(req.body.userId) || !isObject(req.body.profileData)) {
    return res.status(400).json({ error: 'Invalid input data format.' });
  }
  try {
    const { userId, profileData } = req.body;
    await pool.query(
      'INSERT INTO user_profiles (user_id, profile_data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET profile_data = $2, updated_at = CURRENT_TIMESTAMP',
      [userId, JSON.stringify(profileData)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Internal Server Error:', err);
    res.status(500).json({
      error: 'Strategic anomaly detected. Secure operations compromised.',
    });
  }
});

app.post('/api/auth/session', authenticateToken, (req, res) => {
  const requestedUserId = req.body && req.body.userId;
  const authenticatedUserId = req.user && req.user.userId;

  if (!authenticatedUserId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (requestedUserId && requestedUserId !== authenticatedUserId) {
    return res
      .status(403)
      .json({ error: 'Cannot create a session for another user.' });
  }

  const token = jwt.sign({ userId: authenticatedUserId }, JWT_SECRET, {
    expiresIn: '1h',
  });
  res.json({ token });
});

// Security Endpoints
app.get(
  '/api/security/logs/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM security_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/security/log',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    if (!isNonEmptyString(req.body.eventType)) {
      return res.status(400).json({ error: 'eventType is required.' });
    }
    try {
      const { userId, eventType, description, ipAddress, userAgent } = req.body;
      await pool.query(
        'INSERT INTO security_logs (user_id, event_type, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
        [userId, eventType, description || '', ipAddress || '', userAgent || '']
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.get(
  '/api/security/sessions/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC',
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/security/session',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    if (!isNonEmptyString(req.body.sessionId)) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }
    try {
      const { sessionId, userId, deviceName, location } = req.body;
      await pool.query(
        'INSERT INTO user_sessions (session_id, user_id, device_name, location) VALUES ($1, $2, $3, $4) ON CONFLICT (session_id) DO UPDATE SET last_active = CURRENT_TIMESTAMP',
        [sessionId, userId, deviceName || '', location || '']
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.delete(
  '/api/security/session/:sessionId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { rows } = await pool.query(
        'SELECT user_id FROM user_sessions WHERE session_id = $1',
        [sessionId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Session not found.' });
      }

      if (rows[0].user_id !== req.user.userId) {
        return res
          .status(403)
          .json({ error: 'Access denied. Strategic breach detected.' });
      }

      await pool.query('DELETE FROM user_sessions WHERE session_id = $1', [
        sessionId,
      ]);
      return res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      return res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.delete(
  '/api/security/sessions/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [
        userId,
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/auth/login-email',
  loginEmailLimiter,
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, email, artistName, loginAt } = req.body || {};

      // Require userId and a syntactically valid email from the request body.
      if (!userId || !isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'A valid userId and recipient email are required.',
        });
      }

      // Verify the userId exists in the database and that the stored email
      // matches the requested recipient address.  This prevents any caller from
      // triggering a notification email to an address they do not own.
      const { rows } = await pool.query(
        'SELECT profile_data FROM user_profiles WHERE user_id = $1',
        [userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized.',
        });
      }

      const storedEmail =
        rows[0].profile_data && rows[0].profile_data.email
          ? String(rows[0].profile_data.email).trim().toLowerCase()
          : null;

      if (!storedEmail || storedEmail !== String(email).trim().toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized.',
        });
      }

      const transport = createEmailTransport();
      if (!transport) {
        return res.status(202).json({
          success: false,
          skipped: true,
          message: 'SMTP transport is not configured.',
        });
      }

      // Use server-derived metadata instead of client-supplied values.
      const serverUserAgent = req.get('User-Agent') || 'unknown';
      const serverIpAddress = req.ip || 'unknown';
      const safeArtistName = escapeHtml(artistName || 'Artist');
      const timestamp = formatLoginTimestamp(loginAt);
      const subjectPrefix = process.env.SMTP_SUBJECT_PREFIX || 'S.M.U.V.E 2.0';

      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: storedEmail,
        subject: `${subjectPrefix} login confirmation`,
        text: [
          `Hi ${safeArtistName},`,
          '',
          'We detected a successful login to your S.M.U.V.E 2.0 account.',
          `Login time: ${timestamp}`,
          `Device: ${serverUserAgent}`,
          `IP address: ${serverIpAddress}`,
          '',
          'If this was you, no action is required.',
          'If this was not you, please secure your account immediately.',
        ].join(''),
        html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin-bottom: 12px;">S.M.U.V.E 2.0 Login Confirmation</h2>
          <p>Hi ${safeArtistName},</p>
          <p>We detected a successful login to your S.M.U.V.E 2.0 account.</p>
          <ul>
            <li><strong>Login time:</strong> ${escapeHtml(timestamp)}</li>
            <li><strong>Device:</strong> ${escapeHtml(serverUserAgent)}</li>
            <li><strong>IP address:</strong> ${escapeHtml(serverIpAddress)}</li>
          </ul>
          <p>If this was you, no action is required.</p>
          <p>If this was not you, please secure your account immediately.</p>
        </div>
      `,
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('Failed to send login confirmation email', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to send login confirmation email.',
      });
    }
  }
);

// Project Endpoints (Cloud Sync)
app.get(
  '/api/projects/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/projects',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    if (
      !isNonEmptyString(req.body.projectId) ||
      !isNonEmptyString(req.body.userId) ||
      !isNonEmptyString(req.body.title) ||
      !isObject(req.body.projectData)
    ) {
      return res.status(400).json({ error: 'Invalid project sync data.' });
    }
    try {
      const { projectId, userId, title, projectData } = req.body;
      await pool.query(
        'INSERT INTO projects (project_id, user_id, title, project_data, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT (project_id) DO UPDATE SET title = $3, project_data = $4, updated_at = CURRENT_TIMESTAMP',
        [projectId, userId, title, JSON.stringify(projectData)]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

// Artist Identity Endpoints
app.get(
  '/api/identity/:userId',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT identity_data, profile_snapshot, updated_at FROM artist_identities WHERE user_id = $1',
        [userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Artist identity not found' });
      }

      return res.json({
        identity: rows[0].identity_data,
        profileSnapshot: rows[0].profile_snapshot,
        updatedAt: rows[0].updated_at,
      });
    } catch (err) {
      console.error('Internal Server Error:', err);
      return res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/identity',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    if (!isObject(req.body.identity)) {
      return res.status(400).json({ error: 'Identity data is required.' });
    }
    try {
      const { userId, identity, profileData } = req.body;
      await pool.query(
        'INSERT INTO artist_identities (user_id, identity_data, profile_snapshot, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET identity_data = $2, profile_snapshot = $3, updated_at = CURRENT_TIMESTAMP',
        [userId, JSON.stringify(identity), JSON.stringify(profileData || null)]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.get(
  '/api/identity/:userId/connectors',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM connector_jobs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

app.post(
  '/api/identity/:userId/connectors/:connectorId/sync',
  authenticateToken,
  authorizeUser,
  async (req, res) => {
    try {
      const { userId, connectorId } = req.params;
      if (!isNonEmptyString(connectorId) || connectorId.length > 80) {
        return res.status(400).json({ error: 'Invalid connector ID.' });
      }
      const { trigger = 'manual', payload = {} } = req.body || {};
      const crypto = require('node:crypto');
      const jobId = `job_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

      await pool.query(
        'INSERT INTO connector_jobs (job_id, user_id, connector_id, status, trigger_type, payload, updated_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [jobId, userId, connectorId, 'queued', trigger, JSON.stringify(payload)]
      );

      res.json({ success: true, jobId, status: 'queued' });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);

// AI Analyze Proxy
app.post(
  '/api/ai/deep-audit',
  aiAnalyzeLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const { profile } = req.body;
      const prompt = `PERFORM TOTAL PROJECT AUDIT FOR ${profile.artistName}.
      Analyze User DNA: ${JSON.stringify(profile)}.
      Identify every technical, legal, and strategic deficit.
      Return JSON with fields: report (text), deficits (array), roadmap (array).`;

      const response = await genAI.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt,
      });
      res.json({ success: true, report: response.text });
    } catch (err) {
      res.status(500).json({ error: 'Deep audit failed.' });
    }
  }
);

app.post(
  '/api/ai/industry-search',
  aiAnalyzeLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const { query } = req.body;
      const prompt = `EXTERNAL INTELLIGENCE GATHERING: ${query}.
      Provide actionable, high-stakes intel that only an Elite-level guru would possess.`;

      const response = await genAI.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt,
      });
      res.json({ success: true, intel: response.text });
    } catch (err) {
      res.status(500).json({ error: 'Industry search failed.' });
    }
  }
);

app.post(
  '/api/ai/analyze',
  aiAnalyzeLimiter,
  authenticateToken,
  async (req, res) => {
    if (!isNonEmptyString(req.body.prompt)) {
      return res.status(400).json({ error: 'A non-empty prompt is required.' });
    }
    try {
      const { prompt } = req.body;
      const response = await genAI.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt,
      });
      res.json({ text: response.text });
    } catch (err) {
      console.error('Internal Server Error:', err);
      res.status(500).json({
        error: 'Strategic anomaly detected. Secure operations compromised.',
      });
    }
  }
);



// SOCKET.IO INTEGRATION FOR RIVAL HUB & SOCIAL NETWORKING
const { Server } = require("socket.io");
const matchmakingQueue = new Map(); // gameId -> [ { userId, socketId } ]
const setupSocketIO = (server) => {
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

    socket.on("queue_for_match", (data) => {
      const { userId, gameId } = data || {};
      if (!userId || !gameId) return;
      console.log(`User ${userId} queued for game ${gameId}`);
      if (!matchmakingQueue.has(gameId)) {
        matchmakingQueue.set(gameId, []);
      }
      const queue = matchmakingQueue.get(gameId);

      // Clean up stale entries (older than 60 seconds)
      const now = Date.now();
      const staleThreshold = 60000;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (now - queue[i].timestamp > staleThreshold) {
          queue.splice(i, 1);
        }
      }

      if (!queue.find(u => u.userId === userId)) {
        queue.push({ userId, socketId: socket.id, timestamp: now });
      }

      if (queue.length >= 2) {
        const player1 = queue.shift();
        const player2 = queue.shift();
        io.to(player1.socketId).emit("match_found", { opponentId: player2.userId, gameId });
        io.to(player2.socketId).emit("match_found", { opponentId: player1.userId, gameId });
        console.log(`Match found for ${gameId}: ${player1.userId} vs ${player2.userId}`);

        // Remove empty gameId bucket
        if (queue.length === 0) {
          matchmakingQueue.delete(gameId);
        }
      }
    });

    socket.on("cancel_match", (data) => {
      const { userId, gameId } = data;
      if (matchmakingQueue.has(gameId)) {
        const queue = matchmakingQueue.get(gameId);
        const index = queue.findIndex(u => u.userId === userId);
        if (index !== -1) {
          queue.splice(index, 1);
          console.log(`User ${userId} left queue for ${gameId}`);
        }
        // Remove empty gameId bucket
        if (queue.length === 0) {
          matchmakingQueue.delete(gameId);
        }
      }
    });

    socket.on("create_party", (data) => {
      const { partyId, leaderId, gameId } = data;
      socket.join(`party_${partyId}`);
      console.log(`Party ${partyId} created by ${leaderId} for ${gameId}`);
      socket.emit("party_created", { partyId, leaderId, gameId });
    });

    socket.on("join_party", (data) => {
      const { partyId, userId, artistName } = data;
      socket.join(`party_${partyId}`);
      io.to(`party_${partyId}`).emit("user_joined_party", { partyId, userId, artistName });
      console.log(`User ${userId} joined party ${partyId}`);
    });

    socket.on("leave_party", (data) => {
      const { partyId, userId, artistName } = data;
      socket.leave(`party_${partyId}`);
      io.to(`party_${partyId}`).emit("user_left_party", { partyId, userId, artistName });
      console.log(`User ${userId} left party ${partyId}`);
    });


    socket.on("party_launch_game", (data) => {
      const { partyId, gameId } = data;
      io.to(`party_${partyId}`).emit("party_launch_game", { partyId, gameId });
      console.log(`Party ${partyId} launching game ${gameId}`);
    });


    socket.on("send_message", async (data) => {
      const { toUserId, message, fromUserId, fromUserName } = data;
      const timestamp = Date.now();

      try {
        await pool.query(
          'INSERT INTO direct_messages (from_user_id, to_user_id, message, timestamp) VALUES ($1, $2, $3, $4)',
          [fromUserId, toUserId, message, timestamp]
        );

        const recipientSocket = [...onlineUsers.values()].find(u => u.userId === toUserId);
        if (recipientSocket) {
          io.to(recipientSocket.socketId).emit("message", {
            fromUserId,
            fromUserName,
            toUserId,
            message,
            timestamp
          });
        }
      } catch (err) {
        console.error('Save DM Error:', err);
      }
    });

    socket.on("neural_sync_request", (data) => {
      const { toUserId, fromUserId, fromUserName, syncType } = data;
      const recipientSocket = [...onlineUsers.values()].find(u => u.userId === toUserId);
      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("neural_sync_invite", { fromUserId, fromUserName, syncType });
        console.log(`Neural sync requested from ${fromUserId} to ${toUserId}`);
      }
    });

    socket.on("neural_sync_approve", (data) => {
      const { toUserId, fromUserId, fromUserName, syncData } = data;
      const recipientSocket = [...onlineUsers.values()].find(u => u.userId === toUserId);
      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("neural_sync_complete", { fromUserId, fromUserName, syncData });
        console.log(`Neural sync approved between ${fromUserId} and ${toUserId}`);
      }
    });

    socket.on("invite_to_party", (data) => {
      const { toUserId, partyId, fromUserId, fromUserName, gameId } = data;
      const recipientSocket = [...onlineUsers.values()].find(u => u.userId === toUserId);
      if (recipientSocket) {
        io.to(recipientSocket.socketId).emit("party_invite", { partyId, fromUserId, fromUserName, gameId });
        console.log(`Party invite from ${fromUserId} to ${toUserId} for party ${partyId}`);
      }
    });
    socket.on("send_party_message", (data) => {
      const { partyId, message, fromUserId, fromUserName } = data;
      io.to(`party_${partyId}`).emit("party_message", { partyId, fromUserId, fromUserName, message, timestamp: Date.now() });
    });

    socket.on("disconnect", () => {
      matchmakingQueue.forEach((queue, gameId) => {
        const index = queue.findIndex(u => u.socketId === socket.id);
        if (index !== -1) {
          queue.splice(index, 1);
          // Remove empty gameId bucket
          if (queue.length === 0) {
            matchmakingQueue.delete(gameId);
          }
        }
      });
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
};

const startEliteServer = async (port = process.env.PORT || 3000) => {
  await initDb();
  const server = http.createServer(app);
  const io = setupSocketIO(server);
  server.listen(port, '0.0.0.0', () => {
    console.log(`S.M.U.V.E 2.0 Elite Server running on port ${port}`);
  });
  return { server, io };
};

// Update module exports to use startEliteServer
module.exports = {
  app,
  startServer: startEliteServer,
};

if (require.main === module) {
  void startEliteServer();
}


// User Discovery Endpoints
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
        (profile_data->>'profileSetupCompleted')::boolean as "profileSetupCompleted",
        (profile_data->>'eliteScore')::int as "eliteScore",
        (profile_data->>'squadCount')::int as "squadCount"
       FROM user_profiles
       WHERE profile_data->>'artistName' != 'Incognito'
    `;
    const params = [];

    if (q && typeof q === 'string') {
      params.push(`%${q}%`);
      query += ` AND (profile_data->>'artistName' ILIKE $${params.length} OR profile_data->>'primaryGenre' ILIKE $${params.length})`;
    }

    if (location && typeof location === 'string') {
      params.push(`%${location}%`);
      query += ` AND profile_data->>'location' ILIKE $${params.length}`;
    }

    query += ` ORDER BY (profile_data->>'eliteScore')::int DESC NULLS LAST LIMIT 20`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).json({ error: 'Failed to search users.' });
  }
});



// Multi-Platform OAuth Scaffolds
const PLATFORMS = ['twitch', 'youtube', 'discord', 'tiktok', 'instagram', 'kick', 'x'];

PLATFORMS.forEach(platform => {
  app.get(`/api/auth/${platform}`, (req, res) => {
    // In production, these would use environment-specific client IDs and scopes
    const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`] || 'MOCK_CLIENT_ID';
    const redirectUri = process.env[`${platform.toUpperCase()}_REDIRECT_URI`] || `https://smuve-v4-backend-9951606049235487441.onrender.com/api/auth/${platform}/callback`;

    let url = '';
    if (platform === 'twitch') {
      url = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=user:read:email`;
    } else if (platform === 'youtube') {
      url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly`;
    } else {
      // Generic mock for others
      url = `${redirectUri}?code=MOCK_CODE_${platform.toUpperCase()}`;
    }
    res.redirect(url);
  });

  app.get(`/api/auth/${platform}/callback`, (req, res) => {
    const { code } = req.query;
    res.send(`<html><script>window.opener.postMessage({ type: "${platform.toUpperCase()}_AUTH_SUCCESS", code: "${code}" }, "*"); window.close();</script></html>`);
  });
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

// Friends Endpoints

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
    // Send notification to the friend
    const { rows: userRows } = await pool.query('SELECT profile_data->>\'artistName\' as "artistName" FROM user_profiles WHERE user_id = $1', [userId]);
    const artistName = userRows[0]?.artistName || 'An operative';
    await sendSocialNotification(friendId, 'New Connection Request', `${artistName} has linked with your executive profile on S.M.U.V.E 2.0.`);
    res.json({ success: true });
  } catch (err) {
    console.error('Add Friend Error:', err);
    res.status(500).json({ error: 'Failed to add friend.' });
  }
});


app.patch('/api/users/:userId/friends/:friendId', authenticateToken, authorizeUser, async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    const { status } = req.body; // 'accepted' or 'declined'

    if (status === 'declined') {
        await pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [friendId, userId]);
        await sendSocialNotification(friendId, 'Connection Update', `Your connection request to an operative has been declined.`);
        return res.json({ success: true, message: 'Connection declined.' });
    }

    await pool.query(
      'UPDATE friends SET status = $1 WHERE user_id = $2 AND friend_id = $3',
      [status, friendId, userId]
    );

    // Create reciprocal connection
    await pool.query(
      'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = $3',
      [userId, friendId, status]
    );

    const { rows: userRows } = await pool.query('SELECT profile_data->>\'artistName\' as "artistName" FROM user_profiles WHERE user_id = $1', [userId]);
    const artistName = userRows[0]?.artistName || 'An operative';
    await sendSocialNotification(friendId, 'Connection Approved', `${artistName} has approved your connection request.`);

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
      'DELETE FROM friends WHERE user_id = $1 AND friend_id = $2',
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Remove Friend Error:', err);
    res.status(500).json({ error: 'Failed to remove friend.' });
  }
});
}
