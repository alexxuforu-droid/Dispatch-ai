const config = {
  // Shared test scaffolding, not a suite. The preset's testMatch globs every file under
  // __tests__, so it would otherwise fail with "must contain at least one test".
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/asyncStorageMock\\.ts$'],
};

module.exports = require('@rnx-kit/jest-preset')('windows', config);
