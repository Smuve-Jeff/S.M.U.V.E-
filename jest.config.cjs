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
      moduleNameMapper: {
        '^tone$': '<rootDir>/node_modules/tone/build/Tone.js',
        // Intercept the ML worker factory so Jest never parses import.meta.url.
        // Production code keeps using the real factory via Angular esbuild bundling.
        '(^|[\\/])ml-worker-factory(\\.[jt]s)?$':
          '<rootDir>/src/app/services/ml-worker-factory.mock.ts',
      },
      transformIgnorePatterns: ['node_modules/(?!tone|@angular|@ngneat)'],
    },
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/**/*.spec.js'],
      transform: {},
    },
  ],
};
