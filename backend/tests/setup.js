const path = require('path');
const { randomBytes } = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// A separate migrated PostgreSQL database is recommended. Local development can
// use DATABASE_URL: every test mutation is restricted to freshly created IDs.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
// Test tokens must never depend on, or expose, the developer's actual JWT secret.
process.env.JWT_SECRET = randomBytes(48).toString('hex');

if (!process.env.DATABASE_URL) {
  throw new Error('Tests require TEST_DATABASE_URL or DATABASE_URL pointing to a migrated PostgreSQL database.');
}
