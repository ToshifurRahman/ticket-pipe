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

// Story 7.0.7: the web app imports one way, app → pages → features → shared. Outside code
// reaches a feature only through its index.ts (tests may also use its testing.ts); inside, a
// feature uses relative paths and never climbs out of its folder. landing → tickets is the one
// allowed cross-feature edge. The last block matching a file wins, so each block lists every
// pattern that applies to it.
const WEB = 'apps/web/src';
const TESTS = '**/*.test.{ts,tsx}';
const webRule = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });
const toShell = { regex: '^@/(app|pages)/', message: 'Only app/ and pages/ compose features.' };
const intoFeature = {
  regex: '^@/features/[^/]+/',
  message: "Import a feature through its index: '@/features/<name>'.",
};
const intoFeatureFromTest = {
  regex: '^@/features/[^/]+/(?!testing$)',
  message: "Import a feature through its index, or its fixtures from '@/features/<name>/testing'.",
};
const crossFeature = {
  regex: '^@/features/',
  message: 'Features never import other features; inside a feature use relative paths.',
};
const crossFeatureFromLanding = {
  regex: '^@/features/(?!tickets$)',
  message: "Landing may import only '@/features/tickets'; inside a feature use relative paths.",
};
const featureBlocks = (dir, cross) => [
  {
    files: [`${WEB}/features/${dir}/*.{ts,tsx}`],
    rules: webRule(toShell, cross, {
      regex: '^\\.\\./',
      message: 'Stay inside the feature folder.',
    }),
  },
  {
    files: [`${WEB}/features/${dir}/*/**/*.{ts,tsx}`],
    rules: webRule(toShell, cross, {
      regex: '^\\.\\./\\.\\./',
      message: 'Stay inside the feature folder.',
    }),
  },
];
const webBoundaries = [
  {
    files: [`${WEB}/{components,hooks,lib,content,config}/**/*.{ts,tsx}`],
    rules: webRule({
      regex: '^@/(app|pages|features)(/|$)',
      message: 'Shared code never imports app/, pages/ or features/.',
    }),
  },
  { files: [`${WEB}/app/**/*.{ts,tsx}`], rules: webRule(intoFeature) },
  { files: [`${WEB}/app/${TESTS}`], rules: webRule(intoFeatureFromTest) },
  { files: [`${WEB}/pages/**/*.{ts,tsx}`], rules: webRule(toShell, intoFeature) },
  {
    files: [`${WEB}/pages/${TESTS}`],
    rules: webRule(
      { regex: '^@/(app/(?!routes$)|pages/)', message: 'Page tests may import only @/app/routes.' },
      intoFeatureFromTest
    ),
  },
  ...featureBlocks('*', crossFeature),
  ...featureBlocks('landing', crossFeatureFromLanding),
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
  ...webBoundaries,
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
  prettier
);
