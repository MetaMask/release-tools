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
    // The template's tsconfigs extend `../../tsconfig.packages.json`, which
    // only resolves once the package has been generated into `packages/`.
    'scripts/create-package/package-template/**',
  ],

  options: {
    typeAware: true,
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
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
        'merged-packages/create-release-branch/**',
        '!merged-packages/create-release-branch/src/ui/**',
        'yarn.config.cjs',
        '**/*.test.ts',
        '**/tests/**',
      ],
      extends: [nodejs],
      rules: {
        // The `create-release-branch` CLI reads environment variables
        // directly, which is expected for a Node.js tool. This matches the
        // equivalent override in `core`.
        'node/no-process-env': 'off',
      },
    },
    {
      files: ['merged-packages/create-release-branch/src/ui/**'],
      env: { browser: true },
    },
  ],
});
