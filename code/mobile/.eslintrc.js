module.exports = {
  extends: 'expo',
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Unused variables must be errors — catch missing import removals
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        // Identifiers starting with _ are intentionally unused
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      },
    ],
    // Consistent with web ESLint config
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['node_modules/', 'babel.config.js'],
}
