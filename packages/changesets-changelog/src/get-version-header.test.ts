import type { ModCompWithPackage } from '@changesets/types';
import { describe, expect, it } from 'vitest';

import { getVersionHeader } from './get-version-header.js';

describe('getVersionHeader', () => {
  it('renders a bracketed Keep a Changelog heading', () => {
    const release = {
      name: 'pkg-a',
      type: 'minor',
      oldVersion: '1.2.2',
      newVersion: '1.2.3',
      changesets: [],
      packageJson: { name: 'pkg-a', version: '1.2.2' },
      dir: '/packages/pkg-a',
    } as ModCompWithPackage;

    expect(getVersionHeader(release)).toBe('## [1.2.3]');
  });
});
