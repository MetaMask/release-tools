import { restoreResidualChangesets } from '@metamask/changesets-utils';
import { execa } from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildChangelog } from '../tests/helpers.js';
import {
  buildLocalChangelogSummary,
  getFixturePackageDirectory,
  LOCAL_CHANGELOG_CONFIG,
  LOCAL_CHANGELOG_FILES,
  LOCAL_CHANGELOG_REPOSITORY_URL,
  withChangesetsFixture,
  writeChangesetFile,
  writeChangesetsFixture,
} from '../tests/unit/changesets-fixture.js';
import type {
  ChangesetsFixtureChangeset,
  ChangesetsFixtureOptions,
  ChangesetsFixturePackage,
} from '../tests/unit/changesets-fixture.js';
import {
  buildMockProject,
  createNoopWriteStream,
} from '../tests/unit/helpers.js';
import { applyChangesetsRelease } from './changesets-apply.js';
import { loadChangesetsPlan } from './changesets-plan.js';
import type { LoadedChangesetsPlan } from './changesets-plan.js';
import { planChangesetsRelease } from './changesets-release-plan.js';
import type { ChangesetsReleasePlan } from './changesets-release-plan.js';
import { findChangesetsCandidates } from './changesets-release-specification.js';
import {
  readMonorepoRootPackage,
  readMonorepoWorkspacePackage,
  updatePackage,
} from './package.js';
import type { Project } from './project.js';
import { SemVer } from './semver.js';

vi.mock('@metamask/changesets-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@metamask/changesets-utils')>();
  return {
    ...actual,
    restoreResidualChangesets: vi.fn(actual.restoreResidualChangesets),
  };
});
vi.mock('./package', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./package.js')>();
  return { ...actual, updatePackage: vi.fn(actual.updatePackage) };
});

const RECOVERY_COMMAND =
  'git restore :/ && git clean -fd -e RELEASE_SPEC.yml :/';

const RECOVERY_MESSAGE = `The release could not be completed. Changesets that were only partly released have been restored. Discard the remaining uncommitted changes (${RECOVERY_COMMAND}, from anywhere in the repository), then run this tool again to resume from the release spec.`;

const RESTORATION_FAILED_MESSAGE = `The release could not be completed, and the Changesets that were only partly released could not be restored. Discard every uncommitted change to get the Changesets back (${RECOVERY_COMMAND}, from anywhere in the repository), then run this tool again to resume from the release spec.`;

const REPOSITORY_URL = LOCAL_CHANGELOG_REPOSITORY_URL;

/**
 * Builds a link to a pull request of the fixture repository.
 *
 * @param pullRequest - The number of the pull request.
 * @returns The Markdown link.
 */
function link(pullRequest: number): string {
  return `[#${pullRequest}](${REPOSITORY_URL}/pull/${pullRequest})`;
}

const PACKAGES: ChangesetsFixturePackage[] = [
  {
    name: '@example/a',
    version: '1.0.0',
    changelog: buildChangelog(`
      ## [Unreleased]

      ### Added

      - Add a legacy feature to a (${link(1)})

      ## [1.0.0]

      ### Added

      - Initial release (${link(0)})

      [Unreleased]: ${REPOSITORY_URL}/compare/@example/a@1.0.0...HEAD
      [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/a@1.0.0
    `),
  },
  { name: '@example/b', version: '1.0.0' },
  {
    name: '@example/c',
    version: '1.0.0',
    dependencies: { '@example/b': '^1.0.0' },
    changelog: buildChangelog(`
      ## [1.0.0]

      ### Added

      - Initial release (${link(0)})

      [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/c@1.0.0
    `),
  },
  { name: '@example/d', version: '0.1.0' },
  { name: '@example/f', version: '1.0.0' },
  {
    name: '@example/l',
    version: '1.0.0',
    changelog: buildChangelog(`
      ## [Unreleased]

      ### Fixed

      - Fix a legacy bug in l (${link(2)})

      ## [1.0.0]

      ### Added

      - Initial release (${link(0)})

      [Unreleased]: ${REPOSITORY_URL}/compare/@example/l@1.0.0...HEAD
      [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/l@1.0.0
    `),
  },
];

const STRADDLING_CHANGESET: ChangesetsFixtureChangeset = {
  id: 'eager-owls-fly',
  releases: { '@example/a': 'patch', '@example/d': 'minor' },
  summary: buildLocalChangelogSummary('Fixed', 'Fix a and extend d', 13),
};

/**
 * The file of {@link STRADDLING_CHANGESET} once `@example/a` is released.
 */
const RESIDUAL_STRADDLING_CHANGESET = `---\n"@example/d": minor\n---\n${STRADDLING_CHANGESET.summary}`;

const CHANGESETS: ChangesetsFixtureChangeset[] = [
  {
    id: 'brave-cats-sing',
    releases: { '@example/a': 'minor' },
    summary: buildLocalChangelogSummary('Added', 'Add a feature to a', 10),
  },
  {
    id: 'calm-dogs-run',
    releases: { '@example/b': 'major' },
    summary: buildLocalChangelogSummary(
      'Removed',
      'Remove the old API of b',
      12,
    ),
  },
  STRADDLING_CHANGESET,
  {
    id: 'quiet-fish-nap',
    releases: { '@example/f': 'none' },
    summary: 'Touch f without releasing it',
  },
];

const FIXTURE: ChangesetsFixtureOptions = {
  rootManifest: { dependencies: { '@example/a': '^1.0.0' } },
  packages: PACKAGES,
  changesets: CHANGESETS,
  config: LOCAL_CHANGELOG_CONFIG,
  files: LOCAL_CHANGELOG_FILES,
};

/**
 * The release spec that releases everything except `@example/d`.
 */
const ENTRIES: Record<string, string | null> = {
  '@example/a': 'minor',
  '@example/b': 'major',
  '@example/c': 'patch',
  '@example/d': null,
  '@example/l': 'patch',
};

/**
 * Reads the project of a fixture from disk, without Git tags.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @returns The project.
 */
async function readFixtureProject(rootDirectoryPath: string): Promise<Project> {
  const rootPackage = await readMonorepoRootPackage({
    packageDirectoryPath: rootDirectoryPath,
    projectDirectoryPath: rootDirectoryPath,
    projectTagNames: [],
  });
  const packageDirectoryPaths = await fs.promises.readdir(
    path.join(rootDirectoryPath, 'packages'),
  );
  const workspacePackages = await Promise.all(
    packageDirectoryPaths.map(
      async (directoryName) =>
        await readMonorepoWorkspacePackage({
          packageDirectoryPath: path.join(
            rootDirectoryPath,
            'packages',
            directoryName,
          ),
          rootPackageName: 'root',
          rootPackageVersion: new SemVer('1.0.0'),
          projectDirectoryPath: rootDirectoryPath,
          projectTagNames: [],
          stderr: createNoopWriteStream(),
        }),
    ),
  );
  return buildMockProject({
    directoryPath: rootDirectoryPath,
    repositoryUrl: REPOSITORY_URL,
    rootPackage,
    isMonorepo: true,
    workspacePackages: Object.fromEntries(
      workspacePackages.map((pkg) => [pkg.validatedManifest.name, pkg]),
    ),
  });
}

type PreparedRelease = {
  project: Project;
  plan: LoadedChangesetsPlan;
  releasePlan: ChangesetsReleasePlan;
};

/**
 * Reads a fixture from disk and plans a release from the given release spec.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param entries - The release spec entries.
 * @returns The project, the loaded plan and the release plan.
 */
async function prepareRelease(
  rootDirectoryPath: string,
  entries: Record<string, string | null>,
): Promise<PreparedRelease> {
  const project = await readFixtureProject(rootDirectoryPath);
  const plan = await loadChangesetsPlan(rootDirectoryPath);
  const candidates = await findChangesetsCandidates({ project, plan });
  const releasePlan = planChangesetsRelease({
    project,
    plan,
    candidates,
    entries,
    releaseSpecificationPath: path.join(rootDirectoryPath, 'RELEASE_SPEC.yml'),
  });
  return { project, plan, releasePlan };
}

/**
 * Plans and applies a release on a fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param entries - The release spec entries.
 * @param newReleaseVersion - The new version of the root package.
 * @returns The prepared release.
 */
async function release(
  rootDirectoryPath: string,
  entries: Record<string, string | null>,
  newReleaseVersion = '2.0.0',
): Promise<PreparedRelease> {
  const prepared = await prepareRelease(rootDirectoryPath, entries);
  await applyChangesetsRelease({
    ...prepared,
    newReleaseVersion,
    formatter: 'prettier',
    stderr: createNoopWriteStream(),
  });
  return prepared;
}

/**
 * Reads a file of a fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param relativePath - The path of the file, relative to the root.
 * @returns The content of the file.
 */
async function readFixtureFile(
  rootDirectoryPath: string,
  relativePath: string,
): Promise<string> {
  return await fs.promises.readFile(
    path.join(rootDirectoryPath, relativePath),
    'utf8',
  );
}

/**
 * Reads the manifest of a fixture package.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param name - The name of the package, or `root`.
 * @returns The manifest.
 */
async function readManifest(
  rootDirectoryPath: string,
  name: string,
): Promise<Record<string, unknown>> {
  const directory =
    name === 'root'
      ? '.'
      : getFixturePackageDirectory({ name, version: '0.0.0' });
  return JSON.parse(
    await readFixtureFile(
      rootDirectoryPath,
      path.join(directory, 'package.json'),
    ),
  ) as Record<string, unknown>;
}

/**
 * Reads the changelog of a fixture package.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param name - The name of the package.
 * @returns The changelog content.
 */
async function readChangelog(
  rootDirectoryPath: string,
  name: string,
): Promise<string> {
  return await readFixtureFile(
    rootDirectoryPath,
    path.join(
      getFixturePackageDirectory({ name, version: '0.0.0' }),
      'CHANGELOG.md',
    ),
  );
}

/**
 * Reads the Changeset files of a fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @returns The content of each Changeset file, by file name.
 */
async function readChangesetFiles(
  rootDirectoryPath: string,
): Promise<Record<string, string>> {
  const changesetDirectoryPath = path.join(rootDirectoryPath, '.changeset');
  const fileNames = (await fs.promises.readdir(changesetDirectoryPath))
    .filter((fileName) => fileName.endsWith('.md'))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      fileNames.map(
        async (fileName): Promise<[string, string]> => [
          fileName,
          await fs.promises.readFile(
            path.join(changesetDirectoryPath, fileName),
            'utf8',
          ),
        ],
      ),
    ),
  );
}

describe('changesets-apply', () => {
  describe('applyChangesetsRelease', () => {
    describe('after releasing every package except @example/d', () => {
      let rootDirectoryPath: string;
      let prepared: PreparedRelease;

      beforeAll(async () => {
        rootDirectoryPath = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), 'create-release-branch-changesets-apply-'),
        );
        await writeChangesetsFixture(rootDirectoryPath, FIXTURE);
        prepared = await release(rootDirectoryPath, ENTRIES, '3.0.0');
      });

      afterAll(async () => {
        await fs.promises.rm(rootDirectoryPath, {
          force: true,
          recursive: true,
        });
      });

      it('sets the versions and internal ranges of the filtered plan', async () => {
        expect(
          await readManifest(rootDirectoryPath, '@example/a'),
        ).toMatchObject({ version: '1.1.0' });
        expect(
          await readManifest(rootDirectoryPath, '@example/b'),
        ).toMatchObject({ version: '2.0.0' });
        expect(
          await readManifest(rootDirectoryPath, '@example/c'),
        ).toStrictEqual({
          name: '@example/c',
          version: '1.0.1',
          dependencies: { '@example/b': '^2.0.0' },
        });
        expect(
          await readManifest(rootDirectoryPath, '@example/d'),
        ).toMatchObject({ version: '0.1.0' });
        expect(
          await readManifest(rootDirectoryPath, '@example/f'),
        ).toMatchObject({ version: '1.0.0' });
      });

      it('writes categorized release blocks with legacy entries merged and regenerated links', async () => {
        expect(await readChangelog(rootDirectoryPath, '@example/a')).toBe(
          buildChangelog(`
            ## [1.1.0]

            ### Added

            - Add a legacy feature to a (${link(1)})
            - Add a feature to a (${link(10)})

            ### Fixed

            - Fix a and extend d (${link(13)})

            ## [1.0.0]

            ### Added

            - Initial release (${link(0)})

            [1.1.0]: ${REPOSITORY_URL}/compare/@example/a@1.0.0...@example/a@1.1.0
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/a@1.0.0
          `),
        );
        expect(await readChangelog(rootDirectoryPath, '@example/c')).toBe(
          buildChangelog(`
            ## [1.0.1]

            ### Changed

            - Bump \`@example/b\` from \`1.0.0\` to \`2.0.0\`

            ## [1.0.0]

            ### Added

            - Initial release (${link(0)})

            [1.0.1]: ${REPOSITORY_URL}/compare/@example/c@1.0.0...@example/c@1.0.1
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/c@1.0.0
          `),
        );
      });

      it('turns a changelog created by the release into a standard changelog', async () => {
        expect(await readChangelog(rootDirectoryPath, '@example/b')).toBe(
          buildChangelog(`
            ## [2.0.0]

            ### Removed

            - **BREAKING:** Remove the old API of b (${link(12)})

            [2.0.0]: ${REPOSITORY_URL}/releases/tag/@example/b@2.0.0
          `),
        );
      });

      it('releases a package that only has legacy Unreleased entries', async () => {
        expect(
          await readManifest(rootDirectoryPath, '@example/l'),
        ).toMatchObject({ version: '1.0.1' });
        expect(await readChangelog(rootDirectoryPath, '@example/l')).toBe(
          buildChangelog(`
            ## [1.0.1]

            ### Fixed

            - Fix a legacy bug in l (${link(2)})

            ## [1.0.0]

            ### Added

            - Initial release (${link(0)})

            [1.0.1]: ${REPOSITORY_URL}/compare/@example/l@1.0.0...@example/l@1.0.1
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/l@1.0.0
          `),
        );
      });

      it('bumps the root version and keeps the range that the release updated in the root manifest', async () => {
        expect(await readManifest(rootDirectoryPath, 'root')).toStrictEqual({
          name: 'root',
          version: '3.0.0',
          private: true,
          workspaces: ['packages/*'],
          dependencies: { '@example/a': '^1.1.0' },
        });
      });

      it('deletes consumed changesets and restores the rest of a straddling changeset', async () => {
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual({
          'eager-owls-fly.md': RESIDUAL_STRADDLING_CHANGESET,
        });
      });

      it('leaves the same files if the restoration runs twice', async () => {
        const { plan, releasePlan } = prepared;
        const changesetFiles = await readChangesetFiles(rootDirectoryPath);

        await restoreResidualChangesets({
          changesetDir: path.join(rootDirectoryPath, '.changeset'),
          changesets: plan.originalChangesets,
          releasedPackageNames: releasePlan.filteredPlan.releases.map(
            ({ name }) => name,
          ),
        });

        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual(
          changesetFiles,
        );
      });
    });

    it('releases the rest of a straddling changeset in a later release', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        await release(rootDirectoryPath, ENTRIES);
        await release(rootDirectoryPath, { '@example/d': 'minor' }, '3.0.0');

        expect(
          await readManifest(rootDirectoryPath, '@example/d'),
        ).toMatchObject({ version: '0.2.0' });
        expect(await readChangelog(rootDirectoryPath, '@example/d')).toBe(
          buildChangelog(`
            ## [0.2.0]

            ### Fixed

            - Fix a and extend d (${link(13)})

            [0.2.0]: ${REPOSITORY_URL}/releases/tag/@example/d@0.2.0
          `),
        );
        expect(
          await readManifest(rootDirectoryPath, '@example/a'),
        ).toMatchObject({ version: '1.1.0' });
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual({});
      });
    });

    describe('when a straddling changeset releases a devDependent', () => {
      const DEV_DEPENDENT_CHANGESET: ChangesetsFixtureChangeset = {
        id: 'bold-ducks-swim',
        releases: { '@example/a': 'major', '@example/b': 'patch' },
        summary: buildLocalChangelogSummary('Changed', 'Break a and fix b', 20),
      };

      const UNSELECTED_CHANGESET: ChangesetsFixtureChangeset = {
        id: 'shy-moles-dig',
        releases: { '@example/b': 'patch', '@example/n': 'minor' },
        summary: buildLocalChangelogSummary('Fixed', 'Fix b and extend n', 21),
      };

      const DEV_DEPENDENT_FIXTURE: ChangesetsFixtureOptions = {
        packages: [
          { name: '@example/a', version: '1.0.0' },
          {
            name: '@example/b',
            version: '1.0.0',
            devDependencies: { '@example/a': '^1.0.0' },
          },
          { name: '@example/n', version: '1.0.0' },
        ],
        changesets: [DEV_DEPENDENT_CHANGESET, UNSELECTED_CHANGESET],
        config: LOCAL_CHANGELOG_CONFIG,
        files: LOCAL_CHANGELOG_FILES,
      };

      it('restores the release of the devDependent that the spec leaves out', async () => {
        await withChangesetsFixture(
          DEV_DEPENDENT_FIXTURE,
          async (rootDirectoryPath) => {
            const { releasePlan } = await release(rootDirectoryPath, {
              '@example/a': 'major',
            });

            expect(
              releasePlan.filteredPlan.releases.map(({ name, type }) => ({
                name,
                type,
              })),
            ).toContainEqual({ name: '@example/b', type: 'none' });
            expect(
              (await readChangesetFiles(rootDirectoryPath))[
                'bold-ducks-swim.md'
              ],
            ).toBe(
              `---\n"@example/b": patch\n---\n${DEV_DEPENDENT_CHANGESET.summary}`,
            );
          },
        );
      });

      it('leaves a changeset that the spec does not select untouched', async () => {
        await withChangesetsFixture(
          DEV_DEPENDENT_FIXTURE,
          async (rootDirectoryPath) => {
            const changesetFiles = await readChangesetFiles(rootDirectoryPath);

            await release(rootDirectoryPath, { '@example/a': 'major' });

            expect(
              (await readChangesetFiles(rootDirectoryPath))['shy-moles-dig.md'],
            ).toBe(changesetFiles['shy-moles-dig.md']);
          },
        );
      });
    });

    it('leaves every changeset untouched and explains how to recover if the changelog module throws', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        await writeChangesetFile(rootDirectoryPath, {
          id: 'sharp-bees-buzz',
          releases: { '@example/a': 'patch' },
          summary: 'A summary without a category',
        });
        const changesetFiles = await readChangesetFiles(rootDirectoryPath);
        const prepared = await prepareRelease(rootDirectoryPath, ENTRIES);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(restoreResidualChangesets).mockClear();

        const promise = applyChangesetsRelease({
          ...prepared,
          newReleaseVersion: '2.0.0',
          formatter: 'prettier',
          stderr: createNoopWriteStream(),
        });

        await expect(promise).rejects.toThrow(RECOVERY_MESSAGE);
        await expect(promise).rejects.toMatchObject({
          cause: {
            message: 'Unsupported summary in changeset sharp-bees-buzz',
          },
        });
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual(
          changesetFiles,
        );
        expect(restoreResidualChangesets).not.toHaveBeenCalled();
      });
    });

    it('restores residual changesets if the release fails after the changesets are consumed', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const updateError = new Error('Could not update the package');
        vi.mocked(updatePackage).mockRejectedValueOnce(updateError);

        const promise = release(rootDirectoryPath, ENTRIES);

        await expect(promise).rejects.toThrow(RECOVERY_MESSAGE);
        await expect(promise).rejects.toMatchObject({ cause: updateError });
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual({
          'eager-owls-fly.md': RESIDUAL_STRADDLING_CHANGESET,
        });
      });
    });

    it('can resume with the recovery commands after the release created a changelog and failed', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const releaseSpecificationPath = path.join(
          rootDirectoryPath,
          'RELEASE_SPEC.yml',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'packages: {}\n');
        const changesetFiles = await readChangesetFiles(rootDirectoryPath);
        vi.mocked(updatePackage).mockRejectedValueOnce(
          new Error('Could not update the package'),
        );

        await expect(release(rootDirectoryPath, ENTRIES)).rejects.toThrow(
          RECOVERY_MESSAGE,
        );
        expect(await readChangelog(rootDirectoryPath, '@example/b')).toMatch(
          /^## \[2\.0\.0\]$/mu,
        );
        await execa(RECOVERY_COMMAND, {
          cwd: path.join(rootDirectoryPath, 'packages', 'a'),
          shell: true,
        });
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual(
          changesetFiles,
        );
        expect(
          await fs.promises.readFile(releaseSpecificationPath, 'utf8'),
        ).toBe('packages: {}\n');

        await release(rootDirectoryPath, ENTRIES);

        expect(
          (await readChangelog(rootDirectoryPath, '@example/b')).match(
            /^## \[/gmu,
          ),
        ).toStrictEqual(['## [']);
      });
    });

    it('fails before changing any file if a never-released changelog keeps a link reference definition', async () => {
      await withChangesetsFixture(
        {
          ...FIXTURE,
          packages: [
            ...PACKAGES,
            {
              name: '@example/n',
              version: '0.0.0',
              changelog: buildChangelog(`
                ## [Unreleased]

                [Unreleased]: ${REPOSITORY_URL}/
              `),
            },
          ],
          changesets: [
            ...CHANGESETS,
            {
              id: 'young-ants-dig',
              releases: { '@example/n': 'minor' },
              summary: buildLocalChangelogSummary('Added', 'Start n', 14),
            },
          ],
        },
        async (rootDirectoryPath) => {
          const prepared = await prepareRelease(rootDirectoryPath, {
            ...ENTRIES,
            '@example/n': 'minor',
          });
          const { stdout: statusBefore } = await execa(
            'git',
            ['status', '--porcelain'],
            { cwd: rootDirectoryPath },
          );

          await expect(
            applyChangesetsRelease({
              ...prepared,
              newReleaseVersion: '2.0.0',
              formatter: 'prettier',
              stderr: createNoopWriteStream(),
            }),
          ).rejects.toThrow(
            `The changelog of @example/n (${path.join(
              rootDirectoryPath,
              'packages',
              'n',
              'CHANGELOG.md',
            )}) has no release yet but has a link reference definition, so the release cannot be added to it. Remove the empty Unreleased section and its link reference definition, then run this tool again.`,
          );
          expect(statusBefore).toBe('');
          const { stdout: statusAfter } = await execa(
            'git',
            ['status', '--porcelain'],
            { cwd: rootDirectoryPath },
          );
          expect(statusAfter).toBe('');
        },
      );
    });

    it('names the package whose changelog cannot be parsed after the release block is written', async () => {
      await withChangesetsFixture(
        {
          ...FIXTURE,
          packages: [
            ...PACKAGES.filter(({ name }) => name !== '@example/c'),
            {
              name: '@example/c',
              version: '1.0.0',
              dependencies: { '@example/b': '^1.0.0' },
              changelog: buildChangelog(`
                ## Notes

                ## [1.0.0]

                ### Added

                - Initial release (${link(0)})

                [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/c@1.0.0
              `),
            },
          ],
        },
        async (rootDirectoryPath) => {
          const promise = release(rootDirectoryPath, ENTRIES);

          await expect(promise).rejects.toThrow(RECOVERY_MESSAGE);
          await expect(promise).rejects.toMatchObject({
            cause: {
              message: `Could not parse the changelog of @example/c (${path.join(
                rootDirectoryPath,
                'packages',
                'c',
                'CHANGELOG.md',
              )}).`,
            },
          });
        },
      );
    });

    it('reports both errors if the restoration fails after the release failed', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const updateError = new Error('Could not update the package');
        vi.mocked(updatePackage).mockRejectedValueOnce(updateError);
        const restorationError = new Error('Could not write the changeset');
        vi.mocked(restoreResidualChangesets).mockRejectedValueOnce(
          restorationError,
        );

        const promise = release(rootDirectoryPath, ENTRIES);

        await expect(promise).rejects.toThrow(RESTORATION_FAILED_MESSAGE);
        const error = await promise.catch(
          (caughtError: unknown) => caughtError,
        );
        expect((error as Error).cause).toBeInstanceOf(AggregateError);
        expect(((error as Error).cause as AggregateError).errors).toStrictEqual(
          [updateError, restorationError],
        );
      });
    });

    it('reports the restoration error if only the restoration fails', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const prepared = await prepareRelease(rootDirectoryPath, ENTRIES);
        const restorationError = new Error('Could not write the changeset');
        vi.mocked(restoreResidualChangesets).mockRejectedValueOnce(
          restorationError,
        );

        const promise = applyChangesetsRelease({
          ...prepared,
          newReleaseVersion: '2.0.0',
          formatter: 'prettier',
          stderr: createNoopWriteStream(),
        });

        await expect(promise).rejects.toThrow(RESTORATION_FAILED_MESSAGE);
        await expect(promise).rejects.toMatchObject({
          cause: restorationError,
        });
      });
    });

    it('reports every restoration error and still restores the other changesets', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const firstError = new Error('Could not write the first changeset');
        const secondError = new Error('Could not write the second changeset');
        vi.mocked(restoreResidualChangesets)
          .mockRejectedValueOnce(firstError)
          .mockRejectedValueOnce(secondError);

        const promise = release(rootDirectoryPath, ENTRIES);

        await expect(promise).rejects.toThrow(RESTORATION_FAILED_MESSAGE);
        await expect(promise).rejects.toMatchObject({
          cause: {
            message: 'Restoring several Changesets failed.',
            errors: [firstError, secondError],
          },
        });
        expect(await readChangesetFiles(rootDirectoryPath)).toStrictEqual({
          'eager-owls-fly.md': RESIDUAL_STRADDLING_CHANGESET,
        });
      });
    });
  });
});
