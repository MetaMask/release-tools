import type { NewChangesetWithCommit } from '@changesets/types';
import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractPullRequestNumber,
  getPullRequestLink,
} from './resolve-pull-request.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

const changeset = {
  id: 'quick-lions-devour',
  summary: '## Added\n\n- Add a feature',
  releases: [{ name: 'pkg-a', type: 'minor' }],
  commit: 'abc1234',
} as NewChangesetWithCommit;

describe('extractPullRequestNumber', () => {
  it('extracts a number from a squash-merge subject', () => {
    expect(extractPullRequestNumber('Add a feature (#1234)')).toBe('1234');
  });

  it('extracts a number from a merge-commit subject', () => {
    expect(
      extractPullRequestNumber('Merge pull request #1234 from owner/feature'),
    ).toBe('1234');
  });

  it('throws when a subject has no pull request number', () => {
    expect(() => extractPullRequestNumber('Add a feature')).toThrow(
      'does not contain a pull request number',
    );
  });
});

describe('getPullRequestLink', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('reads the commit subject and returns a pull request link', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'Add a feature (#1234)' } as never);

    expect(await getPullRequestLink(changeset, 'MetaMask/core')).toBe(
      '[#1234](https://github.com/MetaMask/core/pull/1234)',
    );
    expect(mockedExeca).toHaveBeenCalledWith('git', [
      'show',
      '-s',
      '--format=%s',
      'abc1234',
    ]);
  });

  it('throws when the changeset has no commit', async () => {
    const withoutCommit = { ...changeset };
    delete withoutCommit.commit;
    await expect(
      getPullRequestLink(withoutCommit, 'MetaMask/core'),
    ).rejects.toThrow('quick-lions-devour has no commit');
  });

  it('throws when git cannot read the commit', async () => {
    mockedExeca.mockRejectedValue(new Error('unknown revision'));
    await expect(
      getPullRequestLink(changeset, 'MetaMask/core'),
    ).rejects.toThrow(
      'Could not read commit abc1234 for changeset quick-lions-devour',
    );
  });

  it('throws when git returns an empty subject', async () => {
    mockedExeca.mockResolvedValue({ stdout: '  ' } as never);
    await expect(
      getPullRequestLink(changeset, 'MetaMask/core'),
    ).rejects.toThrow(
      'Could not read commit abc1234 for changeset quick-lions-devour',
    );
  });
});
