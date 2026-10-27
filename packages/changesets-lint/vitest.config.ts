import { basename } from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // The display name when running multiple projects.
      name: basename(import.meta.dirname),

      coverage: {
        // The process-only adapter delegates to the tested CLI.
        exclude: ['src/main.ts'],
        // The test run fails when coverage drops below these.
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
