// Dedicated configuration for the accessibility audit suite. It reuses the base
// Jest setup but only runs `*.a11y.test.tsx` files, which render components and
// validate them with axe-core, emitting a readable report.
const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/src/**/*.a11y.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/'],
};
