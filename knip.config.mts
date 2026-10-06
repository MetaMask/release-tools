import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        'scripts/**/*.{ts,js,sh}',
        'tests/**/*.ts',
        '*.config.{js,cjs,mjs,ts}',
      ],
      project: ['scripts/**/*.ts', 'tests/**/*.ts', '*.{js,cjs,mjs,ts}'],
      ignore: ['scripts/create-package/package-template/**'],
      ignoreDependencies: [
        // Installed for the `plugin-allow-scripts` Yarn plugin and the
        // `preinstall` lifecycle guard, neither of which knip can see.
        '@lavamoat/allow-scripts',
        '@lavamoat/preinstall-always-fail',
        // `bats` (used to run the shell script tests) ships a non-standard
        // `bin` field, so it has no `.bin` shim and is invoked by path. knip
        // can't tie that invocation back to the dependency.
        'bats',
      ],
    },
    'packages/*': {
      ignoreDependencies: [
        // Invoked as `yarn auto-changelog` by the shared changelog scripts in
        // `scripts/`, so knip can't tie it back to this workspace.
        '@metamask/auto-changelog',
        // Resolved by the apply-release-plan test through import-meta-resolve.
        '@changesets/cli',
      ],
    },
    'merged-packages/create-release-branch': {
      ignoreDependencies: [
        // Loaded by the UI build through Tailwind's Vite plugin and by
        // `react-markdown`'s runtime imports, neither of which knip resolves.
        'react-markdown',
        'tailwindcss',
      ],
    },
  },
};

export default config;
