const { dirname } = require('path');
const { fileURLToPath } = require('url');

const __dirname = dirname(fileURLToPath(require('url').pathToFileURL(__filename)));

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: [`${__dirname}/../../apps/web/tsconfig.json`, `${__dirname}/../../packages/*/tsconfig.json`],
      },
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'import/no-unresolved': 'error',
  },
};
