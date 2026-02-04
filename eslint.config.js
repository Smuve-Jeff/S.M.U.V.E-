import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
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
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
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
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**'],
  }
);
