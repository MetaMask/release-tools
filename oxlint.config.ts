import base, { createConfig } from '@metamask/oxlint-config';
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
        'yarn.config.cjs',
      ],
      extends: [nodejs],
    },
    {
      files: ['**/*.test.ts'],
      extends: [nodejs, vitest],
      rules: {
        'vitest/no-conditional-expect': 'off',
        'vitest/no-conditional-in-test': 'off',
      },
    },
    {
      files: ['tests/**/*.ts'],
      extends: [nodejs],
    },
  ],
});
