// Server (Node) test environment setup.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgres://localhost:5432/testdb';
process.env.PORT = '0';
