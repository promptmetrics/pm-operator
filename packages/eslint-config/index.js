const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const eslintConfigPrettier = require('eslint-config-prettier');

/**
 * Flat ESLint config for the PromptMetrics Operator workspace.
 *
 * Import this in an app/package `eslint.config.mjs`:
 *
 *   import base from '@pm-operator/eslint-config';
 *   export default base;
 *
 * Or extend it:
 *
 *   import base from '@pm-operator/eslint-config';
 *   import tseslint from 'typescript-eslint';
 *   export default tseslint.config(...base, { ... });
 */
module.exports = tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/no-unresolved': 'error',
    },
  }
);
