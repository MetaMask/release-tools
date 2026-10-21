import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getChangedChangesetPaths } from './git.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

describe('getChangedChangesetPaths', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns added and modified Changeset Markdown paths', async () => {
    mockedExeca.mockResolvedValue({
      stdout:
        'A\0.changeset/added file.md\0M\0.changeset/modified.md\0D\0.changeset/deleted.md\0R100\0.changeset/old.md\0.changeset/new.md\0A\0.changeset/config.json\0A\0.changeset/nested/file.md\0A\0.changeset/README.md\0',
    } as never);

    expect(
      await getChangedChangesetPaths('/repo', 'origin/main'),
    ).toStrictEqual(['.changeset/added file.md', '.changeset/modified.md']);
    expect(mockedExeca).toHaveBeenCalledWith(
      'git',
      [
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
        '--diff-filter=AM',
        '--end-of-options',
        'origin/main',
        'HEAD',
        '--',
        '.changeset',
      ],
      { cwd: '/repo' },
    );
  });

  it('returns no paths when git reports no changes', async () => {
    mockedExeca.mockResolvedValue({ stdout: '' } as never);

    expect(await getChangedChangesetPaths('/repo', 'HEAD^')).toStrictEqual([]);
  });

  it('identifies the revision when git fails', async () => {
    const cause = new Error('unknown revision');
    mockedExeca.mockRejectedValue(cause);

    await expect(
      getChangedChangesetPaths('/repo', 'missing-ref'),
    ).rejects.toThrow(
      'Could not find changed Changeset files since missing-ref in /repo.',
    );
  });
});
