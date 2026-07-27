module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }]
  },
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/__mocks__/uuid.js'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
