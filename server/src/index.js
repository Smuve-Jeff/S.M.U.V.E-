const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/health', (req, res) => res.json({ status: 'S.M.U.V.E. 4.0 Backend Operational' }));

app.get('/api/v1/artist-profile/:userId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM artist_profiles WHERE user_id = $1', [req.params.userId]);
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/artist-profile', async (req, res) => {
  const { userId, name, bio, expertise, marketing_budget, career_goals } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO artist_profiles (user_id, name, bio, expertise, marketing_budget, career_goals)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name, bio = EXCLUDED.bio, expertise = EXCLUDED.expertise,
         marketing_budget = EXCLUDED.marketing_budget, career_goals = EXCLUDED.career_goals,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, name, bio, expertise, marketing_budget, career_goals]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => console.log(`S.M.U.V.E. 4.0 Backend listening at http://localhost:${port}`));
