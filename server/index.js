const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    `);
    console.log('Database initialized with Security and Project support');
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
  console.log(`S.M.U.V.E 4.2 Backend running on port ${PORT}`);
});
