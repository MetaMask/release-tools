import { basename } from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),
      coverage: {
        thresholds: {
          branches: 66,
          functions: 77,
          lines: 74,
          statements: 74,
        },
      },
    },
  }),
);
