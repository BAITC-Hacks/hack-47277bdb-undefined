module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  maxWorkers: 1,
  clearMocks: true,
};
