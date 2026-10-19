import { CATEGORIES } from '@metamask/changesets-utils';
import { describe, expect, it } from 'vitest';

import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
  getVersionHeader,
} from './changelog-functions.js';
import changelogFunctions from './index.js';

describe('changelog functions', () => {
  it('exports the interface expected by applyReleasePlan', () => {
    expect(changelogFunctions).toStrictEqual({
      categories: CATEGORIES,
      categorizeDependencyReleaseLine,
      categorizeReleaseLine,
      getDependencyReleaseLine,
      getReleaseLine,
      getVersionHeader,
    });
  });
});
