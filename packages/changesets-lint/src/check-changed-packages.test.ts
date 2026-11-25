import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkChangedPackages } from './check-changed-packages.js';
import type { WorkspacePackage } from './workspace-package-names.js';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const mockedExeca = vi.mocked(execa);
const mockedReadFile = vi.mocked(readFile);

const DEFAULT_WORKSPACES: WorkspacePackage[] = [
  { name: '@metamask/root', location: '.', isPrivate: true },
  { name: '@metamask/private', location: 'packages/private', isPrivate: true },
  { name: '@metamask/alpha', location: 'packages/alpha', isPrivate: false },
  { name: '@metamask/beta', location: 'packages/beta', isPrivate: false },
];

/**
 * Configures mocked `execa` responses for git commands.
 *
 * @param options - Mock git command outputs.
 * @param options.mergeBase - Commit SHA returned by `git merge-base`.
 * @param options.changedFiles - Files returned by `git diff --name-only`.
 * @param options.addedModifiedFiles - Files returned by `git diff --diff-filter=AM`.
 * @param options.gitFiles - Map of `<rev>:<path>` to file contents.
 */
function mockGitCommands({
  mergeBase = 'base-sha',
  changedFiles = [],
  addedModifiedFiles = [],
  gitFiles = {},
}: {
  mergeBase?: string;
  changedFiles?: string[];
  addedModifiedFiles?: string[];
  gitFiles?: Record<string, string>;
}): void {
  mockedExeca.mockImplementation((async (_cmd: string, args: string[]) => {
    if (args[0] === 'merge-base') {
      return { stdout: `${mergeBase}\n` };
    }
    if (args[0] === 'diff' && args.includes('--diff-filter=AM')) {
      return { stdout: addedModifiedFiles.join('\n') };
    }
    if (args[0] === 'diff') {
      return { stdout: changedFiles.join('\n') };
    }
    if (args[0] === 'show') {
      const spec = args[1];
      if (Object.hasOwn(gitFiles, spec)) {
        return { stdout: gitFiles[spec] };
      }
      throw new Error(`Missing git object ${spec}`);
    }
    throw new Error(`Unexpected git call: ${args.join(' ')}`);
  }) as unknown as typeof execa);
}

describe('checkChangedPackages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns no diagnostics when all workspaces are private', async () => {
    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: [
          { name: '@metamask/root', location: '.', isPrivate: true },
        ],
      }),
    ).toStrictEqual([]);

    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('throws a contextual error when git merge-base fails', async () => {
    const cause = new Error('fatal: Not a valid object name origin/main');
    mockedExeca.mockRejectedValue(cause);

    await expect(
      checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).rejects.toThrow(
      'Could not find a common ancestor between HEAD and origin/main.',
    );
  });

  it('returns no diagnostics when only root, private, or ignored package files changed', async () => {
    mockGitCommands({
      changedFiles: [
        'README.md',
        'packages/private/src/index.ts',
        'packages/alpha/CHANGELOG.md',
        'packages/alpha/docs/guide.md',
        'packages/alpha/src/docs/notes.md',
        'packages/alpha/tests/helper.ts',
        'packages/alpha/src/__tests__/helper.ts',
        'packages/alpha/src/index.test.ts',
        'packages/alpha/src/index.spec.js',
      ],
    });

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).toStrictEqual([]);
  });

  it('ignores package.json deletions and version-only or devDependencies-only edits', async () => {
    mockGitCommands({
      changedFiles: [
        'packages/alpha/package.json',
        'packages/beta/package.json',
      ],
      gitFiles: {
        'base-sha:packages/alpha/package.json': JSON.stringify({
          name: '@metamask/alpha',
          version: '1.0.0',
          dependencies: { foo: '^1.0.0' },
          devDependencies: { vitest: '^4.0.0' },
        }),
        'HEAD:packages/alpha/package.json': JSON.stringify({
          name: '@metamask/alpha',
          version: '1.0.1',
          dependencies: { foo: '^1.0.0' },
          devDependencies: { vitest: '^5.0.0' },
        }),
      },
    });

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).toStrictEqual([]);
  });

  it('requires a changeset when a new package.json is added or dependencies change', async () => {
    mockGitCommands({
      changedFiles: [
        'packages/alpha/package.json',
        'packages/beta/package.json',
      ],
      gitFiles: {
        'base-sha:packages/alpha/package.json': JSON.stringify({
          name: '@metamask/alpha',
          version: '1.0.0',
          dependencies: { foo: '^1.0.0' },
        }),
        'HEAD:packages/alpha/package.json': JSON.stringify({
          name: '@metamask/alpha',
          version: '1.0.0',
          dependencies: { foo: '^2.0.0' },
        }),
        'HEAD:packages/beta/package.json': JSON.stringify({
          name: '@metamask/beta',
          version: '0.1.0',
        }),
      },
    });

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).toStrictEqual([
      {
        rule: 'missing-changeset',
        packageName: '@metamask/alpha',
        message:
          'The package @metamask/alpha changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
      {
        rule: 'missing-changeset',
        packageName: '@metamask/beta',
        message:
          'The package @metamask/beta changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
    ]);
  });

  it('throws when package.json does not parse to a JSON object', async () => {
    mockGitCommands({
      changedFiles: ['packages/alpha/package.json'],
      gitFiles: {
        'base-sha:packages/alpha/package.json': '[]',
        'HEAD:packages/alpha/package.json': '{}',
      },
    });

    await expect(
      checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).rejects.toThrow('Expected package.json to contain a JSON object.');
  });

  it('matches nested and root public workspaces in innermost-first order', async () => {
    mockGitCommands({
      changedFiles: [
        'src/index.ts',
        'packages/alpha/src/index.ts',
        'packages/alpha/sub/src/index.ts',
      ],
    });

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: [
          {
            name: '@metamask/alpha',
            location: 'packages/alpha',
            isPrivate: false,
          },
          { name: '@metamask/root', location: '.', isPrivate: false },
          {
            name: '@metamask/alpha-sub',
            location: 'packages/alpha/sub',
            isPrivate: false,
          },
        ],
      }),
    ).toStrictEqual([
      {
        rule: 'missing-changeset',
        packageName: '@metamask/alpha',
        message:
          'The package @metamask/alpha changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
      {
        rule: 'missing-changeset',
        packageName: '@metamask/alpha-sub',
        message:
          'The package @metamask/alpha-sub changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
      {
        rule: 'missing-changeset',
        packageName: '@metamask/root',
        message:
          'The package @metamask/root changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
    ]);
  });

  it('checks each changed package once and requires a valid non-none changeset bump', async () => {
    mockGitCommands({
      changedFiles: [
        'packages/alpha/src/a.ts',
        'packages/alpha/src/b.ts',
        'packages/beta/src/index.ts',
      ],
      addedModifiedFiles: [
        '.changeset/README.md',
        '.changeset/cover-alpha.md',
        '.changeset/none-beta.md',
      ],
    });
    mockedReadFile
      .mockResolvedValueOnce(
        '---\n"@metamask/alpha": minor\n---\n\n## Added\n\n- Add feature\n',
      )
      .mockResolvedValueOnce(
        '---\n"@metamask/beta": none\n"@metamask/gamma": 123\n---\n\n## Changed\n\n- Ignore\n',
      );

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).toStrictEqual([
      {
        rule: 'missing-changeset',
        packageName: '@metamask/beta',
        message:
          'The package @metamask/beta changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
    ]);
  });

  it('passes when all changed packages are covered by added or modified changesets', async () => {
    mockGitCommands({
      changedFiles: [
        'packages/alpha/src/index.ts',
        'packages/beta/src/index.ts',
      ],
      addedModifiedFiles: ['.changeset/release.md'],
    });
    mockedReadFile.mockResolvedValueOnce(
      '---\n"@metamask/alpha": patch\n"@metamask/beta": major\n---\n\n## Changed\n\n- Update both\n',
    );

    expect(
      await checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).toStrictEqual([]);
  });

  it('throws a contextual error when an added or modified changeset cannot be read', async () => {
    mockGitCommands({
      changedFiles: ['packages/alpha/src/index.ts'],
      addedModifiedFiles: ['.changeset/broken.md'],
    });
    mockedReadFile.mockRejectedValue(new Error('permission denied'));

    await expect(
      checkChangedPackages({
        repositoryDirectory: '/repo',
        since: 'origin/main',
        workspaces: DEFAULT_WORKSPACES,
      }),
    ).rejects.toThrow('Could not read Changeset file .changeset/broken.md.');
  });
});
