// Installs are per workspace, so eslint runs from apps/api (its config and binary live there).
export default {
  'apps/api/src/**/*.{ts,tsx}': (files) => `sh -c 'cd apps/api && ../../node_modules/.bin/eslint --fix ${files.map((f) => `"${f}"`).join(' ')}'`,
};
