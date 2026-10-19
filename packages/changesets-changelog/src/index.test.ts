import { describe, expect, it } from 'vitest';

import changelogFunctions, {
  categories,
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './index.js';

describe('changelog functions', () => {
  it('exports the interface expected by applyReleasePlan', () => {
    expect(changelogFunctions).toStrictEqual({
      categories,
      categorizeDependencyReleaseLine,
      categorizeReleaseLine,
      getDependencyReleaseLine,
      getReleaseLine,
    });
  });
});
