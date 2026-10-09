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
    // The template's tsconfigs extend `../../tsconfig.packages.json`, which
    // only resolves once the package has been generated into `packages/`.
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
        'packages/*/vitest.config.mjs',
        'yarn.config.cjs',
        '**/*.test.ts',
        '**/tests/**',
      ],
      extends: [nodejs],
    },
  ],
});
