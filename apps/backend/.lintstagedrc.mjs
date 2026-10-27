// Se ejecuta desde el hook pre-commit de la raíz, solo sobre los archivos en stage de esta app.
export default {
  '*.{ts,mjs}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,md,yml,yaml}': 'prettier --write',
};
