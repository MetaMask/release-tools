import { describe, expect, it } from 'vitest';

import { categories } from './categories.js';

describe('categories', () => {
  it('lists the Keep a Changelog categories in render order', () => {
    expect(categories).toStrictEqual([
      'Added',
      'Changed',
      'Deprecated',
      'Removed',
      'Fixed',
      'Security',
    ]);
  });
});
