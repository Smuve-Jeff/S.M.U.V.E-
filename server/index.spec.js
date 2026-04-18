process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

const poolQueryMock = jest.fn();

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: poolQueryMock,
  })),
}));

jest.mock('express-rate-limit', () =>
  jest.fn(() => (_req, _res, next) => next())
);

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(),
  })),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const http = require('node:http');
const { app } = require('./index');

describe('server/index.js backend smoke tests', () => {
  let server;

  const startServer = async () =>
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve(`http://127.0.0.1:${port}`);
      });
    });

  const stopServer = async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    server = undefined;
  };

  const requestJson = async (baseUrl, path, options = {}) =>
    await new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(
        url,
        {
          method: options.method || 'GET',
          headers: options.headers,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              json: body ? JSON.parse(body) : null,
            });
          });
        }
      );
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });

  afterEach(async () => {
    await stopServer();
    poolQueryMock.mockReset();
  });

  it('does not initialize the database while importing the module', () => {
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it('returns a JSON error for invalid request payloads', async () => {
    const baseUrl = await startServer();

    const response = await requestJson(baseUrl, '/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"userId":',
    });

    expect(response.json).toEqual({
      error: 'Invalid JSON payload.',
    });
    expect(response.status).toBe(400);
  });

  it('rejects authenticated requests that lack a userId claim', async () => {
    const baseUrl = await startServer();
    const token = jwt.sign({}, process.env.JWT_SECRET);

    const response = await requestJson(baseUrl, '/api/auth/session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-1' }),
    });

    expect(response.json).toEqual({
      error: 'Authentication required.',
    });
    expect(response.status).toBe(401);
  });

  it('serves profile requests when the token user matches the route user', async () => {
    const baseUrl = await startServer();
    const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET);
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const response = await requestJson(baseUrl, '/api/profile/user-1', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.json).toEqual({
      error: 'Profile not found',
    });
    expect(response.status).toBe(404);
    expect(poolQueryMock).toHaveBeenCalledWith(
      'SELECT profile_data FROM user_profiles WHERE user_id = $1',
      ['user-1']
    );
  });
});
