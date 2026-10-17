module.exports = {
  preset: 'react-native',
  // Shared test scaffolding, not a suite. The preset's testMatch globs every file under
  // __tests__, so it would otherwise fail with "must contain at least one test".
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/asyncStorageMock\\.ts$'],
};