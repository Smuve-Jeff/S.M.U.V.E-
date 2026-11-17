const { createCjsPreset } = require('jest-preset-angular/presets');

module.exports = {
  ...createCjsPreset({
    tsconfig: '<rootDir>/tsconfig.spec.json',
    stringifyContentPathRegex: '\\.html$',
  }),
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  // The workers themselves shut down in a few milliseconds, but Jest's parent
  // process can take noticeably longer than the 500ms default to reap their
  // exit events on a busy machine, which force-kills workers that already
  // exited and prints the "failed to exit gracefully" warning. Give the parent
  // room to collect those exits; a real leaked handle still exceeds this and
  // still surfaces the warning.
  workerGracefulExitTimeout: 3000,
  // A heavy suite (smuve-tv, vocal-suite, ...) can sit just under the heap cap
  // and crash a worker while its neighbour runs, which Jest reports as
  // "Test suite failed to run" with zero failing tests. Recycle workers that
  // grow past this so a busy full run stays a real pass/fail signal.
  workerIdleMemoryLimit: '1200MB',
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/src/test.ts',
  ],
  projects: [
    {
      displayName: 'angular',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/app/**/*.spec.ts'],
      ...createCjsPreset({
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      }),
      setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
      moduleNameMapper: {
    '^.*stem-worker-factory$': '<rootDir>/src/app/services/stem-worker-factory.mock.ts',
        // jest does not read tsconfig `paths`, so the engine alias the Angular
        // build resolves has to be repeated here.
        '^cinema-engine$': '<rootDir>/cinema-engine/src/index.ts',
        '^tone$': '<rootDir>/node_modules/tone/build/Tone.js',
        // Three 0.187 is ESM-only; the CommonJS Jest preset cannot parse it.
        // Tests have no WebGL, so the renderer only needs its fallback path.
        '^three$': '<rootDir>/src/app/services/three.test-stub.ts',
        // Intercept the ML worker factory so Jest never parses import.meta.url.
        // Production code keeps using the real factory via Angular esbuild bundling.
      },
      transformIgnorePatterns: ['node_modules/(?!tone|@angular|@ngneat)'],
    },
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: [
        '<rootDir>/src/app/',
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/src/test.ts',
      ],
      setupFilesAfterEnv: ['<rootDir>/setup-jest-server.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.(ts|js)$': ['babel-jest', { configFile: './babel.config.cjs' }],
      },
      transformIgnorePatterns: ['node_modules/'],
    },
  ],
};
