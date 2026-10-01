import { basename } from 'path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mjs';

export default mergeConfig(baseConfig, {
  test: {
    name: basename(import.meta.dirname),
    globals: true,
    testTimeout: 30_000,
    setupFiles: ['./tests/setupAfterEnv.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      exclude: ['src/cli.ts', 'src/command-line-arguments.ts', 'src/ui.ts', 'src/ui/types.ts', 'src/dirname.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
