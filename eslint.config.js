// Configuración de ESLint 9 (flat config). Sustituye al antiguo .eslintrc.json.
// Solo cubre el renderer (src/js/**), que es lo que lintea `npm run lint`:
// son módulos ES que corren en el navegador de Electron (y usan algún global de Node).
const globals = require('globals');

module.exports = [
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      // 'smart': exige === salvo en comparaciones contra null (idioma == null,
      // que captura null y undefined a propósito).
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-console': 'off',
    },
  },
];
