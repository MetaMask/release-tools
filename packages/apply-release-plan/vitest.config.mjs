import { basename } from 'path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mjs';

export default mergeConfig(baseConfig, {
  test: {
    // The display name when running multiple projects.
    name: basename(import.meta.dirname),

    coverage: {
      // Test scaffolding (vendored helpers and fixture changelog modules) is
      // not part of the published package.
      exclude: ['src/test-utils/**'],

      // The test run fails when coverage drops below these.
      //
      // This package is a fork of `@changesets/apply-release-plan`, and these
      // thresholds match what the ported upstream test suite covers. Raise
      // them when adding tests rather than lowering them.
      thresholds: {
        branches: 89,
        functions: 95,
        lines: 97,
        statements: 95,
      },
    },
  },
});
