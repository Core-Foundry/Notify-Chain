module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  // The dedicated accessibility suite (`*.a11y.test.tsx`) runs via
  // `npm run test:a11y` / jest.a11y.config.cjs, so keep it out of the default run.
  testPathIgnorePatterns: ['/node_modules/', '\\.a11y\\.test\\.'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'bundler',
        },
      },
    ],
  },
};
