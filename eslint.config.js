import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Story 7.0.5: the Hono family belongs to the HTTP layer, and domain/ stays pure.
const honoPaths = [
  { name: 'hono', message: 'Hono is for routes, controllers and middleware only.' },
];
const honoPatterns = [
  { group: ['hono/*', '@hono/*'], message: 'Hono is for routes, controllers and middleware only.' },
];

// Story 7.0.4: one flat config for the API, the web app, e2e and scripts. Type-aware rules read
// the nearest tsconfig through the project service (root tsconfig.json covers e2e and scripts).
export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      'coverage',
      'test-results',
      'playwright-report',
      '.lighthouseci',
      '.impeccable',
      '.ds-receipts',
      '.claude',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      'apps/api/**',
      'apps/web/scripts/**',
      'apps/web/tests/**',
      'apps/web/vite*.ts',
      'e2e/**',
      'scripts/**',
      '*.{ts,js,mjs,cjs}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/{routes,controllers,middleware}/**',
      'apps/api/src/{app,server}.ts',
      'apps/api/src/domain/**',
    ],
    rules: { 'no-restricted-imports': ['error', { paths: honoPaths, patterns: honoPatterns }] },
  },
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: honoPaths,
          patterns: [
            ...honoPatterns,
            {
              group: ['**/lib/*', '**/services/*', '**/repositories/*'],
              message: 'domain/ is pure: no infrastructure, services or repositories.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
  prettier
);
