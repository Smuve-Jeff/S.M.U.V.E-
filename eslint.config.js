import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        OscillatorType: 'readonly',
        MediaTrackConstraints: 'readonly',
        SpeechRecognition: 'readonly',
        SpeechRecognitionResultList: 'readonly',
        BlobPart: 'readonly',
        MediaRecorderOptions: 'readonly',
      },
    },
    rules: {
      // Formatting belongs to `npm run format` (Prettier). Enforcing it here as
      // an error produced ~67k findings against code that is not fully
      // Prettier-formatted, which buried the real correctness findings. ESLint
      // now gates code quality; Prettier remains the formatter.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'warn',
      'no-case-declarations': 'off',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  {
    // TypeScript already resolves identifiers and DOM lib types. `no-undef`
    // only reports type-only names (AudioContextState, MediaSession, ...) that
    // are not runtime globals; keep the rule for plain JavaScript.
    files: ['**/*.ts'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // AudioWorkletGlobalScope globals are supplied by `addModule()` at runtime,
    // not by the browser/Jest globals object.
    files: ['src/assets/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
        port: 'readonly',
      },
    },
  },
  prettierConfig,
  {
    ignores: ['Build/**', 'dist/**', 'node_modules/**', '.angular/**'],
  }
);
