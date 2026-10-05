// Correctness rules only; no formatting rules (the codebase uses long dense lines on purpose).
// The engine boundary is also in tests/architecture.test.ts; here it shows up while editing.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'ios/**', 'android/**', '.expo/**', 'node_modules/**', 'assets/**', 'docs/**', 'scripts/**', 'plugins/**', 'src/app/map/data.ts', 'eslint.config.mjs'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      // A promise nobody awaits fails silently; on a save path that is a lost entry. Write `void p` when it is intended.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }], // onPress={async () => ...} is normal in React Native
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ regex: '^(?!\\./)', message: 'src/engine imports only its own files (no React, Expo, storage, app code or AI).' }] }] },
  },
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-floating-promises': 'off' } }, // node:test's test() returns a promise by design
);
