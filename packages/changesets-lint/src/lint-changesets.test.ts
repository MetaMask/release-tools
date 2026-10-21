import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getChangesetPaths } from './changeset-paths.js';
import { getChangedChangesetPaths } from './git.js';
import { lintChangesets } from './lint-changesets.js';
import { validateChangesetFile } from './validate-changeset-file.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('./changeset-paths.js', () => ({ getChangesetPaths: vi.fn() }));
vi.mock('./git.js', () => ({ getChangedChangesetPaths: vi.fn() }));
vi.mock('./validate-changeset-file.js', () => ({
  validateChangesetFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);
const mockedGetChangesetPaths = vi.mocked(getChangesetPaths);
const mockedGetChangedChangesetPaths = vi.mocked(getChangedChangesetPaths);
const mockedValidateChangesetFile = vi.mocked(validateChangesetFile);
const workspacePackageNames = new Set(['@metamask/example']);

describe('lintChangesets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedReadFile.mockResolvedValue('contents');
    mockedValidateChangesetFile.mockReturnValue([]);
  });

  it('validates all current Changesets when since is omitted', async () => {
    mockedGetChangesetPaths.mockResolvedValue([
      '.changeset/zebra.md',
      '.changeset/alpha.md',
    ]);
    mockedValidateChangesetFile
      .mockReturnValueOnce([{ message: 'Alpha problem.' }])
      .mockReturnValueOnce([{ line: 2, message: 'Zebra problem.' }]);

    await expect(
      lintChangesets({ repositoryDirectory: '/repo', workspacePackageNames }),
    ).resolves.toStrictEqual([
      { path: '.changeset/alpha.md', message: 'Alpha problem.' },
      {
        path: '.changeset/zebra.md',
        line: 2,
        message: 'Zebra problem.',
      },
    ]);
    expect(mockedGetChangesetPaths).toHaveBeenCalledWith('/repo');
    expect(mockedGetChangedChangesetPaths).not.toHaveBeenCalled();
    expect(mockedReadFile).toHaveBeenNthCalledWith(
      1,
      '/repo/.changeset/alpha.md',
      'utf8',
    );
    expect(mockedValidateChangesetFile).toHaveBeenNthCalledWith(1, {
      path: '.changeset/alpha.md',
      contents: 'contents',
      workspacePackageNames,
    });
  });

  it('validates Changesets changed since a Git revision', async () => {
    mockedGetChangedChangesetPaths.mockResolvedValue([
      '.changeset/changed.md',
    ]);

    await lintChangesets({
      repositoryDirectory: '/repo',
      since: 'HEAD^',
      workspacePackageNames,
    });

    expect(mockedGetChangedChangesetPaths).toHaveBeenCalledWith(
      '/repo',
      'HEAD^',
    );
    expect(mockedGetChangesetPaths).not.toHaveBeenCalled();
  });

  it('identifies a Changeset that cannot be read', async () => {
    mockedGetChangesetPaths.mockResolvedValue(['.changeset/broken.md']);
    mockedReadFile.mockRejectedValue(new Error('permission denied'));

    await expect(
      lintChangesets({ repositoryDirectory: '/repo', workspacePackageNames }),
    ).rejects.toThrow('Could not read Changeset file .changeset/broken.md.');
  });
});
