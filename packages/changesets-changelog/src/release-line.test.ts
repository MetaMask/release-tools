import type {
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './release-line.js';
import { getPullRequestLink } from './resolve-pull-request.js';

vi.mock('./resolve-pull-request.js', () => ({
  getPullRequestLink: vi.fn(),
}));

const mockedGetPullRequestLink = vi.mocked(getPullRequestLink);

const changeset: NewChangesetWithCommit = {
  id: 'quick-lions-devour',
  summary: '## Added\n\n- Add a feature\n  - Preserve this detail',
  releases: [{ name: 'pkg-a', type: 'minor' }],
  commit: 'abc1234',
};

const options = { repository: 'MetaMask/core' };

describe('getReleaseLine', () => {
  beforeEach(() => {
    mockedGetPullRequestLink.mockResolvedValue(
      '[#1234](https://github.com/MetaMask/core/pull/1234)',
    );
  });

  it('formats a categorized summary and preserves nested content', async () => {
    expect(await getReleaseLine(changeset, 'minor', options)).toBe(
      '- Add a feature ([#1234](https://github.com/MetaMask/core/pull/1234))\n  - Preserve this detail',
    );
  });

  it('marks only major releases as breaking', async () => {
    expect(await getReleaseLine(changeset, 'major', options)).toBe(
      '- **BREAKING:** Add a feature ([#1234](https://github.com/MetaMask/core/pull/1234))\n  - Preserve this detail',
    );
  });
});

describe('categorizeReleaseLine', () => {
  it('assigns a rendered line to the summary category', () => {
    expect(categorizeReleaseLine('- Add a feature', changeset)).toStrictEqual([
      { category: 'Added', line: '- Add a feature' },
    ]);
  });
});

const dependency: ModCompWithPackage = {
  name: '@metamask/example',
  type: 'major',
  oldVersion: '1.0.0',
  newVersion: '2.0.0',
  changesets: [],
  packageJson: {
    name: '@metamask/example',
    version: '1.0.0',
  },
  dir: '/packages/example',
};

describe('getDependencyReleaseLine', () => {
  it('formats updated dependencies', () => {
    expect(getDependencyReleaseLine([], [dependency], options)).toBe(
      '- Bump `@metamask/example` from `1.0.0` to `2.0.0`',
    );
  });

  it('returns an empty line when no dependencies were updated', () => {
    expect(getDependencyReleaseLine([], [], options)).toBe('');
  });
});

describe('categorizeDependencyReleaseLine', () => {
  it('assigns dependency updates to Changed', () => {
    expect(
      categorizeDependencyReleaseLine(
        '- Bump `@metamask/example` from `1.0.0` to `2.0.0`',
      ),
    ).toStrictEqual([
      {
        category: 'Changed',
        line: '- Bump `@metamask/example` from `1.0.0` to `2.0.0`',
      },
    ]);
  });

  it('does not emit an empty dependency line', () => {
    expect(categorizeDependencyReleaseLine('')).toStrictEqual([]);
  });
});
