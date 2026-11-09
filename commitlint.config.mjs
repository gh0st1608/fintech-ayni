// Conventional Commits (COPAYNI-9). Lo valida el hook commit-msg y, en CI, el job commitlint.
// Ejemplos: feat(mobile): ..., fix(backend): ..., feat(backoffice): ..., ci: ..., docs: ...
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Ámbitos del monorepo; el ámbito es opcional para cambios transversales.
    'scope-enum': [2, 'always', ['mobile', 'backend', 'backoffice', 'ci', 'deps', 'docs', 'infra']],
  },
};
