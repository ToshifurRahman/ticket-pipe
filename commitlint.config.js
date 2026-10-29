export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['api', 'web', 'e2e', 'infra', 'deps', 'docs']],
  },
};
