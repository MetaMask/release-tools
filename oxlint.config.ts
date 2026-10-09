import base, { createConfig } from '@metamask/oxlint-config';
import browser from '@metamask/oxlint-config-browser';
import commonjs from '@metamask/oxlint-config-commonjs';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';
import vitest from '@metamask/oxlint-config-vitest';

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
        'scripts/create-package/package-template/vitest.config.mjs',
        'packages/create-release-branch/**',
        '!packages/create-release-branch/src/ui/**',
        'yarn.config.cjs',
      ],
      extends: [nodejs],
    },
    {
      files: ['**/*.test.ts'],
      extends: [nodejs, vitest],
    },
    {
      files: ['tests/**/*.ts'],
      extends: [nodejs],
    },
    {
      files: [
        'packages/create-release-branch/**',
        '!packages/create-release-branch/src/ui/**',
      ],
      extends: [nodejs],
      rules: {
        // The `create-release-branch` CLI reads environment variables directly.
        'node/no-process-env': 'off',
      },
    },
    {
      files: ['packages/create-release-branch/src/ui/**'],
      extends: [typescript, browser],
    },
  ],
});
