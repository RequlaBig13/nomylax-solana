import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        fetch: 'readonly', console: 'readonly', process: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        Request: 'readonly', Response: 'readonly', URL: 'readonly',
        AbortSignal: 'readonly', Blob: 'readonly', Buffer: 'readonly',
        IntersectionObserver: 'readonly', requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly', HTMLSpanElement: 'readonly',
        HTMLDivElement: 'readonly', React: 'readonly',
      },
    },
    rules: {
      // Financial code should not silently widen types.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
