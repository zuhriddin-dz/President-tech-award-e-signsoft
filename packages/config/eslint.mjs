import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// One flat config for every workspace. Type-aware linting is deliberately off
// (10x slower; the compiler already runs on build) — revisit if a rule needs it.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
