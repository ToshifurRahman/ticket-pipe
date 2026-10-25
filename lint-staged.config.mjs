export default {
  '*.{ts,tsx,js,mjs,cjs}': 'eslint --fix --max-warnings 0',
  // Respects .prettierignore, so generated and tool-managed files are skipped.
  '*': 'prettier --write --ignore-unknown',
};
