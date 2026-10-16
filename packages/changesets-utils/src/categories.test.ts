import { describe, expect, it } from 'vitest';

import { CATEGORIES } from './categories.js';

describe('categories', () => {
  it('lists the supported changeset categories', () => {
    expect(CATEGORIES).toStrictEqual([
      'Added',
      'Changed',
      'Deprecated',
      'Removed',
      'Fixed',
      'Security',
    ]);
  });
});
