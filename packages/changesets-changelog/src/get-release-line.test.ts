import type { NewChangesetWithCommit } from '@changesets/types';
import { describe, expect, it, vi } from 'vitest';

import { categorizeReleaseLine, getReleaseLine } from './get-release-line.js';
import * as resolvePullRequest from './resolve-pull-request.js';

vi.mock('./resolve-pull-request.js', async () => ({
  ...(await vi.importActual<typeof import('./resolve-pull-request.js')>(
    './resolve-pull-request.js',
  )),
  getPullRequestLink: vi.fn(),
}));

const getPullRequestLink = vi.mocked(resolvePullRequest.getPullRequestLink);
const pullRequestLink = '[#1234](https://github.com/MetaMask/core/pull/1234)';

/**
 * Builds a changeset with the given summary.
 *
 * @param summary - The changeset summary.
 * @returns The changeset.
 */
function buildChangeset(summary: string): NewChangesetWithCommit {
  return {
    id: 'quick-lions-devour',
    summary,
    releases: [{ name: 'pkg-a', type: 'major' }],
    commit: 'abc1234',
  };
}

describe('getReleaseLine', () => {
  it('marks a major entry as breaking', async () => {
    getPullRequestLink.mockResolvedValue(pullRequestLink);

    expect(
      await getReleaseLine(
        buildChangeset('## Added\n\n- Add a feature'),
        'major',
        { repo: 'MetaMask/core' },
      ),
    ).toBe(`- **BREAKING:** Add a feature (${pullRequestLink})`);
  });

  it.each(['minor', 'patch'] as const)(
    'does not mark a %s entry as breaking',
    async (type) => {
      getPullRequestLink.mockResolvedValue(pullRequestLink);

      expect(
        await getReleaseLine(
          buildChangeset('## Changed\n\n- Change a feature'),
          type,
          { repo: 'MetaMask/core' },
        ),
      ).toBe(`- Change a feature (${pullRequestLink})`);
    },
  );

  it('keeps continuation lines and sub-bullets below the entry', async () => {
    getPullRequestLink.mockResolvedValue(pullRequestLink);

    expect(
      await getReleaseLine(
        buildChangeset(
          '## Changed\n\n- Rename `getClient`\nto `getNetworkClient`\n  - The old method is no longer available',
        ),
        'patch',
        { repo: 'MetaMask/core' },
      ),
    ).toBe(
      [
        `- Rename \`getClient\` (${pullRequestLink})`,
        '  to `getNetworkClient`',
        '  - The old method is no longer available',
      ].join('\n'),
    );
  });

  it('throws when the options have no repo', async () => {
    await expect(
      getReleaseLine(
        buildChangeset('## Added\n\n- Add a feature'),
        'patch',
        null,
      ),
    ).rejects.toThrow('Please provide a repo to this changelog generator');
  });

  it('throws the grammar error when the summary is invalid', async () => {
    await expect(
      getReleaseLine(
        buildChangeset('## Added\n\n- Add one\n- Add two'),
        'patch',
        { repo: 'MetaMask/core' },
      ),
    ).rejects.toMatchObject({
      rule: 'multiple-entries',
      line: 4,
    });
  });
});

describe('categorizeReleaseLine', () => {
  it('assigns the line to the category of its changeset', async () => {
    const line = `- Add a feature (${pullRequestLink})`;

    expect(
      await categorizeReleaseLine(
        line,
        buildChangeset('## Added\n\n- Add a feature'),
      ),
    ).toStrictEqual([{ category: 'Added', line }]);
  });
});
