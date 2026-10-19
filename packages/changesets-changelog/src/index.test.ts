import { CATEGORIES } from '@metamask/changesets-utils';
import { describe, expect, it } from 'vitest';

import changelogFunctions from './index.js';
import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './release-line.js';

describe('changelog functions', () => {
  it('exports the interface expected by applyReleasePlan', () => {
    expect(changelogFunctions).toStrictEqual({
      categories: CATEGORIES,
      categorizeDependencyReleaseLine,
      categorizeReleaseLine,
      getDependencyReleaseLine,
      getReleaseLine,
    });
  });
});
