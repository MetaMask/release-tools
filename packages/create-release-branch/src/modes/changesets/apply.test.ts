import type { NewChangeset } from '@changesets/types';
import { applyReleasePlan } from '@metamask/apply-release-plan';
import { oxfmt } from '@metamask/auto-changelog';
import { restoreResidualChangesets } from '@metamask/changesets-utils';
import { describe, expect, it, vi } from 'vitest';

import { buildChangelog } from '../../../tests/helpers.js';
import {
  buildMockChangesetsState,
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import { hasUncommittedChanges } from '../../core/repo.js';
import { getFormatter } from '../../project/package.js';
import {
  fileExists,
  readFile,
  readJsonObjectFile,
  writeFile,
  writeJsonFile,
} from '../../utils/fs.js';
import {
  applyChangesetsRelease,
  ChangesetsApplyError,
  RECOVERY_COMMAND,
} from './apply.js';
import { ChangesetsSetupError } from './load.js';
import type { ChangesetsPlanData } from './plan.js';

vi.mock('@metamask/apply-release-plan');
vi.mock('@metamask/changesets-utils');
vi.mock('../../core/repo');
vi.mock('../../project/package');
vi.mock('../../utils/fs');

const PROJECT = buildMockProject({
  isMonorepo: true,
  rootPackage: buildMockPackage('root', '1.0.0'),
  workspacePackages: {
    a: buildMockPackage('a', '1.0.0'),
    b: buildMockPackage('b', '1.0.0'),
    c: buildMockPackage('c', '1.0.0'),
  },
});

/**
 * A Changeset that releases `a`, which the release keeps, and `b`, which it
 * leaves out.
 */
const SHARED_CHANGESET: NewChangeset = {
  id: 'eager-owls-fly',
  summary: '## Fixed\n\n- Fix a and extend b',
  releases: [
    { name: 'a', type: 'patch' },
    { name: 'b', type: 'minor' },
  ],
};

const SELECTED_CHANGESET: NewChangeset = {
  ...SHARED_CHANGESET,
  releases: [{ name: 'a', type: 'patch' }],
};

const UNRELEASED_CHANGELOG = buildChangelog(`
  ## [Unreleased]

  [Unreleased]: https://repo.url/
`);

/**
 * Builds the data of a plan that releases `a` from a shared Changeset, and
 * keeps `c` unchanged.
 *
 * @returns The plan data.
 */
function buildPlanData(): ChangesetsPlanData {
  return {
    state: buildMockChangesetsState({
      fullPlan: {
        changesets: [SHARED_CHANGESET],
        releases: [],
        preState: undefined,
      },
    }),
    filteredPlan: {
      changesets: [SELECTED_CHANGESET],
      releases: [
        {
          name: 'a',
          type: 'patch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          changesets: [SHARED_CHANGESET.id],
        },
        {
          name: 'c',
          type: 'none',
          oldVersion: '1.0.0',
          newVersion: '1.0.0',
          changesets: [],
        },
      ],
      preState: undefined,
    },
    selectedChangesets: [SELECTED_CHANGESET],
  };
}

/**
 * Builds the data of a plan that releases `a` and `b`.
 *
 * @returns The plan data.
 */
function buildTwoReleasesPlanData(): ChangesetsPlanData {
  const data = buildPlanData();
  return {
    ...data,
    filteredPlan: {
      ...data.filteredPlan,
      releases: [
        ...data.filteredPlan.releases,
        {
          name: 'b',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          changesets: [SHARED_CHANGESET.id],
        },
      ],
    },
  };
}

/**
 * Mocks the changelogs of the given packages.
 *
 * @param changelogs - The content of each changelog, by package name.
 */
function mockChangelogs(changelogs: Record<string, string>): void {
  for (const [name, content] of Object.entries(changelogs)) {
    const { changelogPath } = PROJECT.workspacePackages[name];
    vi.when(vi.mocked(fileExists)).calledWith(changelogPath).thenResolve(true);
    vi.when(vi.mocked(readFile)).calledWith(changelogPath).thenResolve(content);
  }
}

/**
 * Applies a release of the mock project.
 *
 * @param data - The plan data.
 */
async function applyRelease(
  data: ChangesetsPlanData = buildPlanData(),
): Promise<void> {
  await applyChangesetsRelease({
    project: PROJECT,
    data,
    newRootVersion: '2.0.0',
    formatter: 'oxfmt',
  });
}

describe('apply', () => {
  describe('applyChangesetsRelease', () => {
    it('applies the filtered plan with Changesets', async () => {
      const data = buildPlanData();

      await applyRelease(data);

      expect(applyReleasePlan).toHaveBeenCalledWith(
        data.filteredPlan,
        data.state.packages,
        data.state.config,
      );
    });

    it('rewrites the changelog of each bumped package, with the link of its new release section and no empty Unreleased section', async () => {
      mockChangelogs({
        a: buildChangelog(`
          ## [Unreleased]

          ## [1.0.1]

          ### Fixed

          - Fix a and extend b ([#20](https://repo.url/pull/20))

          ## [1.0.0]

          ### Added

          - Initial release

          [Unreleased]: https://repo.url/compare/a@1.0.0...HEAD
          [1.0.0]: https://repo.url/releases/tag/a@1.0.0
        `),
      });
      vi.when(vi.mocked(getFormatter)).calledWith('oxfmt').thenReturn(oxfmt);

      await applyRelease();

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledWith(
        PROJECT.workspacePackages.a.changelogPath,
        buildChangelog(`
          ## [1.0.1]

          ### Fixed

          - Fix a and extend b ([#20](https://repo.url/pull/20))

          ## [1.0.0]

          ### Added

          - Initial release

          [1.0.1]: https://repo.url/compare/a@1.0.0...a@1.0.1
          [1.0.0]: https://repo.url/releases/tag/a@1.0.0
        `),
      );
    });

    it('does not write a changelog for a bumped package that has none', async () => {
      await applyRelease();

      expect(writeFile).not.toHaveBeenCalled();
    });

    it('bumps the root version in the manifest on disk', async () => {
      const { manifestPath } = PROJECT.rootPackage;
      vi.when(vi.mocked(readJsonObjectFile))
        .calledWith(manifestPath)
        .thenResolve({
          name: 'root',
          version: '1.0.0',
          dependencies: { a: '^1.0.1' },
        });

      await applyRelease();

      expect(writeJsonFile).toHaveBeenCalledTimes(1);
      expect(writeJsonFile).toHaveBeenCalledWith(manifestPath, {
        name: 'root',
        version: '2.0.0',
        dependencies: { a: '^1.0.1' },
      });
    });

    it('restores the releases that a shared Changeset leaves out', async () => {
      await applyRelease();

      expect(restoreResidualChangesets).toHaveBeenCalledWith({
        changesetDir: '/path/to/project/.changeset',
        changesets: [SHARED_CHANGESET],
        releasedPackageNames: ['a'],
      });
    });

    it('fails before changing any file if the .changeset directory has uncommitted changes', async () => {
      vi.when(vi.mocked(hasUncommittedChanges))
        .calledWith(PROJECT.directoryPath, '.changeset')
        .thenResolve(true);

      await expect(applyRelease()).rejects.toThrow(
        new ChangesetsSetupError({
          problem: 'The .changeset directory has uncommitted changes.',
          details: ['Commit or remove them, then run this tool again.'],
          filePath: '/path/to/project/.changeset',
        }),
      );
      expect(applyReleasePlan).not.toHaveBeenCalled();
    });

    it('fails before changing any file if the changelog of a released package cannot be parsed', async () => {
      mockChangelogs({
        a: buildChangelog(`
          ## [1.0.0]

          ### Unknown

          - Initial release

          [1.0.0]: https://repo.url/releases/tag/a@1.0.0
        `),
      });

      await expect(applyRelease()).rejects.toThrow(
        new ChangesetsSetupError({
          problem: 'The changelog of a could not be parsed.',
          details: [
            "Invalid change category: 'Unknown'",
            'Fix the changelog, then run this tool again.',
          ],
          filePath: PROJECT.workspacePackages.a.changelogPath,
        }),
      );
      expect(applyReleasePlan).not.toHaveBeenCalled();
    });

    it('fails before changing any file if the changelogs of released packages have entries in Unreleased', async () => {
      const changelogWithUnreleasedEntries = buildChangelog(`
        ## [Unreleased]

        ### Changed

        - Bump \`c\` from \`^1.0.0\` to \`^2.0.0\` ([#30](https://repo.url/pull/30))

        ## [1.0.0]

        ### Added

        - Initial release

        [Unreleased]: https://repo.url/compare/a@1.0.0...HEAD
        [1.0.0]: https://repo.url/releases/tag/a@1.0.0
      `);
      mockChangelogs({
        a: changelogWithUnreleasedEntries,
        b: changelogWithUnreleasedEntries.replaceAll('a@', 'b@'),
      });

      await expect(applyRelease(buildTwoReleasesPlanData())).rejects.toThrow(
        new ChangesetsSetupError({
          problem: '2 changelogs have entries in Unreleased:',
          details: [
            `a ${PROJECT.workspacePackages.a.changelogPath}`,
            `b ${PROJECT.workspacePackages.b.changelogPath}`,
            'Changesets mode does not release entries in Unreleased. Move each entry into a Changeset and commit it, or remove the entry. Then run this tool again.',
          ],
        }),
      );
      expect(applyReleasePlan).not.toHaveBeenCalled();
    });

    it('names a single changelog that has entries in Unreleased', async () => {
      mockChangelogs({
        a: buildChangelog(`
          ## [Unreleased]

          ### Fixed

          - Fix a bug ([#30](https://repo.url/pull/30))

          ## [1.0.0]

          ### Added

          - Initial release

          [Unreleased]: https://repo.url/compare/a@1.0.0...HEAD
          [1.0.0]: https://repo.url/releases/tag/a@1.0.0
        `),
      });

      await expect(applyRelease()).rejects.toThrow(
        '1 changelog has entries in Unreleased:',
      );
    });

    it('fails before changing any file if changelogs with no release have link reference definitions', async () => {
      mockChangelogs({
        a: UNRELEASED_CHANGELOG,
        b: UNRELEASED_CHANGELOG,
      });

      await expect(applyRelease(buildTwoReleasesPlanData())).rejects.toThrow(
        [
          '2 changelogs cannot take the new release section:',
          `a ${PROJECT.workspacePackages.a.changelogPath}`,
          `b ${PROJECT.workspacePackages.b.changelogPath}`,
          'A changelog with no release yet must not have link reference definitions, such as "[Unreleased]: ...". Remove them, then run this tool again.',
        ].join('\n'),
      );
      expect(applyReleasePlan).not.toHaveBeenCalled();
    });

    it('names a single changelog that cannot take the new release section', async () => {
      mockChangelogs({ a: UNRELEASED_CHANGELOG });

      await expect(applyRelease()).rejects.toThrow(
        '1 changelog cannot take the new release section:',
      );
    });

    it('accepts a changelog that already has a release', async () => {
      mockChangelogs({
        a: buildChangelog(`
          ## [Unreleased]

          ## [1.0.0]

          ### Added

          - Initial release

          [Unreleased]: https://repo.url/compare/a@1.0.0...HEAD
          [1.0.0]: https://repo.url/releases/tag/a@1.0.0
        `),
      });

      await applyRelease();

      expect(applyReleasePlan).toHaveBeenCalled();
    });

    it('explains how to recover if a step fails after the checks', async () => {
      const cause = new Error('Could not write the file');
      vi.mocked(applyReleasePlan).mockRejectedValue(cause);

      const promise = applyRelease();

      await expect(promise).rejects.toThrow(ChangesetsApplyError);
      await expect(promise).rejects.toHaveProperty('cause', cause);
    });

    it('does not let applyReleasePlan write errors to the console', async () => {
      const consoleError = vi.spyOn(console, 'error');
      vi.mocked(applyReleasePlan).mockImplementation(async () => {
        console.error('An error was encountered');
        throw new Error('Could not write the file');
      });

      await expect(applyRelease()).rejects.toThrow(ChangesetsApplyError);
      expect(consoleError).not.toHaveBeenCalled();
      expect(console.error).toBe(consoleError);
    });
  });

  describe('ChangesetsApplyError', () => {
    it('describes the cause and the recovery command', () => {
      const error = new ChangesetsApplyError({
        cause: new Error('Could not write the file', {
          cause: new Error('Disk full'),
        }),
      });

      expect(
        error.describe({
          name: (text) => `<${text}>`,
          dim: (text) => `[${text}]`,
        }),
      ).toStrictEqual({
        title: 'The release could not be applied.',
        lines: [
          'Could not write the file',
          'Caused by: Disk full',
          '',
          'The project may now have part of the release. Put the changes aside with this command, then run this tool again:',
          `  ${RECOVERY_COMMAND}`,
        ],
      });
    });

    it('describes a cause that describes itself', () => {
      const error = new ChangesetsApplyError({
        cause: new ChangesetsSetupError({
          problem: 'The changelog of a could not be parsed.',
          details: ['Fix the changelog, then run this tool again.'],
          filePath: '/a/CHANGELOG.md',
        }),
      });

      expect(
        error.describe({
          name: (text) => `<${text}>`,
          dim: (text) => `[${text}]`,
        }).lines,
      ).toStrictEqual([
        'The changelog of a could not be parsed.',
        'Fix the changelog, then run this tool again.',
        '[/a/CHANGELOG.md]',
        '',
        'The project may now have part of the release. Put the changes aside with this command, then run this tool again:',
        `  ${RECOVERY_COMMAND}`,
      ]);
    });

    it('has a plain message', () => {
      const error = new ChangesetsApplyError({
        cause: new Error('Could not write the file'),
      });

      expect(error.message).toBe(
        [
          'The release could not be applied.',
          'Could not write the file',
          '',
          'The project may now have part of the release. Put the changes aside with this command, then run this tool again:',
          `  ${RECOVERY_COMMAND}`,
        ].join('\n'),
      );
    });
  });
});
