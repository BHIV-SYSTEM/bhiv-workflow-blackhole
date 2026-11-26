import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Minimal lint config used as a Vite guard.
 *
 * The default ESLint `no-undef` rule intentionally ignores JSX element names,
 * so deleting an import can leave `<SomeComponent />` compiling successfully
 * and then exploding at runtime with `ReferenceError: SomeComponent is not
 * defined`. This config enables `react/jsx-no-undef` specifically to catch
 * that class of bug during `npm run dev` and `npm run build`.
 */
export default [
  {
    ignores: [
      'dist',
      'node_modules',
      // Legacy unrouted stub. Not imported by App.jsx; the active page is
      // src/pages/NewSalaryManagement.jsx.
      'src/pages/SalaryManagement.jsx',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    // Register the same plugins as the main config so existing inline
    // eslint-disable directives resolve instead of raising "rule not found".
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
    },
  },
]
