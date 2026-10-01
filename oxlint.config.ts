import base, { createConfig } from '@metamask/oxlint-config';
import commonjs from '@metamask/oxlint-config-commonjs';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';

export default createConfig({
  extends: [base],

  ignorePatterns: [
    '**/.tsc-lint-cache',
    '**/api-docs/**',
    '**/coverage/**',
    '**/dist/**',
    '.yarn/**',
    'merged-packages/**',
    'scripts/create-package/package-template/**',
  ],

  options: {
    typeAware: true,
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.mts', '**/*.cts'],
      extends: [typescript],
      rules: {
        'typescript/promise-function-async': 'off',
      },
    },
    {
      files: ['**/*.cjs', '**/*.cts'],
      extends: [nodejs, commonjs],
      rules: {
        'import/extensions': 'off',
        'import/unambiguous': 'off',
      },
    },
    {
      files: [
        '.github/**',
        '**/scripts/**',
        'packages/apply-release-plan/**',
        'yarn.config.cjs',
      ],
      extends: [nodejs],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'n/no-unsupported-features/node-builtins': 'off',
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/tests/**'],
      extends: [nodejs],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'n/no-unsupported-features/node-builtins': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts'],
      rules: {
        'import/extensions': 'off',
      },
    },
  ],
});
