const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Rate Limiting
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
initDb();

// Profile Endpoints
app.get('/api/profile/:userId', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const { userId, profileData } = req.body;
    await pool.query(
      'INSERT INTO user_profiles (user_id, profile_data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET profile_data = $2, updated_at = CURRENT_TIMESTAMP',
      [userId, JSON.stringify(profileData)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Security Endpoints
app.get('/api/security/logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM security_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/security/log', async (req, res) => {
  try {
    const { userId, eventType, description, ipAddress, userAgent } = req.body;
    await pool.query(
      'INSERT INTO security_logs (user_id, event_type, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [userId, eventType, description, ipAddress, userAgent]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/security/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/security/session', async (req, res) => {
  try {
    const { sessionId, userId, deviceName, location } = req.body;
    await pool.query(
      'INSERT INTO user_sessions (session_id, user_id, device_name, location) VALUES ($1, $2, $3, $4) ON CONFLICT (session_id) DO UPDATE SET last_active = CURRENT_TIMESTAMP',
      [sessionId, userId, deviceName, location]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/security/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await pool.query('DELETE FROM user_sessions WHERE session_id = $1', [
      sessionId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/security/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login-email', loginEmailLimiter, async (req, res) => {
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
      ].join('\n'),
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
});

// Project Endpoints (Cloud Sync)
app.get('/api/projects/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { projectId, userId, title, projectData } = req.body;
    await pool.query(
      'INSERT INTO projects (project_id, user_id, title, project_data, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT (project_id) DO UPDATE SET title = $3, project_data = $4, updated_at = CURRENT_TIMESTAMP',
      [projectId, userId, title, JSON.stringify(projectData)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Artist Identity Endpoints
app.get('/api/identity/:userId', async (req, res) => {
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
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/identity', async (req, res) => {
  try {
    const { userId, identity, profileData } = req.body;
    await pool.query(
      'INSERT INTO artist_identities (user_id, identity_data, profile_snapshot, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET identity_data = $2, profile_snapshot = $3, updated_at = CURRENT_TIMESTAMP',
      [userId, JSON.stringify(identity), JSON.stringify(profileData || null)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/identity/:userId/connectors', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM connector_jobs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/api/identity/:userId/connectors/:connectorId/sync',
  async (req, res) => {
    try {
      const { userId, connectorId } = req.params;
      const { trigger = 'manual', payload = {} } = req.body || {};
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await pool.query(
        'INSERT INTO connector_jobs (job_id, user_id, connector_id, status, trigger_type, payload, updated_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [jobId, userId, connectorId, 'queued', trigger, JSON.stringify(payload)]
      );

      res.json({ success: true, jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// AI Analyze Proxy
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { prompt } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ text: response.text() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`S.M.U.V.E 2.0 Backend running on port ${PORT}`);
});
