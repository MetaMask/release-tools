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
    },
    {
      files: ['**/*.cjs', '**/*.cts'],
      extends: [nodejs, commonjs],
      rules: {
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
    },
    {
      files: ['**/*.test.ts', '**/tests/**'],
      extends: [nodejs],
    },
    {
      files: ['scripts/**/*.ts'],
    },
  ],
});
