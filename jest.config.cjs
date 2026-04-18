const { createCjsPreset } = require('jest-preset-angular/presets');

module.exports = {
  ...createCjsPreset({
    tsconfig: '<rootDir>/tsconfig.spec.json',
    stringifyContentPathRegex: '\\.html$',
  }),
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/src/test.ts',
    '<rootDir>/tests/',
  ],
  projects: [
    {
      displayName: 'angular',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      ...createCjsPreset({
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      }),
      setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
    },
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/**/*.spec.js'],
      transform: {},
    },
  ],
};
