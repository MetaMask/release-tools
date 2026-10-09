import { basename } from 'path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mjs';

export default mergeConfig(baseConfig, {
  test: {
    name: basename(import.meta.dirname),
    include: ['src/**/*.test.ts'],
    coverage: {
      exclude: [
        'src/cli.ts',
        'src/command-line-arguments.ts',
        'src/ui.ts',
        'src/ui/types.ts',
        'src/dirname.ts',
      ],
      // These thresholds reflect the migrated suite as-is.
      thresholds: {
        branches: 98.6,
        functions: 100,
        lines: 99.5,
        statements: 99.5,
      },
    },
  },
});
