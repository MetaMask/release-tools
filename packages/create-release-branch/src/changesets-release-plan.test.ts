import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  getFixturePackageDirectory,
  withChangesetsFixture,
} from '../tests/unit/changesets-fixture.js';
import type { ChangesetsFixtureOptions } from '../tests/unit/changesets-fixture.js';
import { buildMockPackage, buildMockProject } from '../tests/unit/helpers.js';
import type { LoadedChangesetsPlan } from './changesets-plan.js';
import { loadChangesetsPlan } from './changesets-plan.js';
import { planChangesetsRelease } from './changesets-release-plan.js';
import type { ChangesetsReleasePlan } from './changesets-release-plan.js';
import { findChangesetsCandidates } from './changesets-release-specification.js';
import type { ChangesetsCandidate } from './changesets-release-specification.js';

const REPOSITORY_URL = 'https://github.com/example/repo';

const RELEASE_SPECIFICATION_PATH = '/path/to/RELEASE_SPEC.yml';

/**
 * Builds the changelog of a package that has legacy `Unreleased` entries.
 *
 * @param name - The name of the package.
 * @returns The changelog content.
 */
function buildLegacyChangelog(name: string): string {
  return `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add a legacy feature ([#1](https://github.com/example/repo/pull/1))

## [1.0.0]

### Added

- Initial release ([#0](https://github.com/example/repo/pull/0))

[Unreleased]: https://github.com/example/repo/compare/${name}@1.0.0...HEAD
[1.0.0]: https://github.com/example/repo/releases/tag/${name}@1.0.0
`;
}

const PACKAGES: NonNullable<ChangesetsFixtureOptions['packages']> = [
  { name: '@scope/a', version: '1.0.0' },
  { name: '@scope/b', version: '1.0.0' },
  {
    name: '@scope/c',
    version: '1.0.0',
    dependencies: { '@scope/b': '^1.0.0' },
  },
  { name: '@scope/d', version: '0.1.0' },
  {
    name: '@scope/e',
    version: '1.0.0',
    dependencies: { '@scope/a': '^1.0.0' },
  },
  { name: '@scope/f', version: '1.0.0' },
  {
    name: '@scope/h',
    version: '1.0.0',
    dependencies: { '@scope/c': '1.0.0' },
  },
  {
    name: '@scope/l',
    version: '1.0.0',
    changelog: buildLegacyChangelog('@scope/l'),
  },
  { name: '@scope/n', version: '1.0.0' },
];

const CHANGESETS: NonNullable<ChangesetsFixtureOptions['changesets']> = [
  {
    id: 'brave-cats-sing',
    releases: { '@scope/a': 'minor' },
    summary: 'Add a feature to a',
  },
  {
    id: 'eager-owls-fly',
    releases: { '@scope/a': 'patch', '@scope/d': 'minor' },
    summary: 'Fix a and add a feature to d',
  },
  {
    id: 'calm-dogs-run',
    releases: { '@scope/b': 'major' },
    summary: 'Break b',
  },
  {
    id: 'quiet-fish-nap',
    releases: { '@scope/f': 'none' },
    summary: 'Touch f without releasing it',
  },
];

const FIXTURE: ChangesetsFixtureOptions = {
  packages: PACKAGES,
  changesets: CHANGESETS,
};

/**
 * The release spec entries prefilled by the template for `FIXTURE`.
 */
const PREFILLED_ENTRIES: Record<string, string | null> = {
  '@scope/a': 'minor',
  '@scope/b': 'major',
  '@scope/d': 'minor',
  '@scope/c': 'patch',
  '@scope/h': 'patch',
  '@scope/l': null,
};

/**
 * Builds a project whose workspace packages point at the fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param packages - The fixture packages.
 * @returns The project.
 */
function buildFixtureProject(
  rootDirectoryPath: string,
  packages: NonNullable<ChangesetsFixtureOptions['packages']>,
): ReturnType<typeof buildMockProject> {
  return buildMockProject({
    directoryPath: rootDirectoryPath,
    repositoryUrl: REPOSITORY_URL,
    isMonorepo: true,
    workspacePackages: Object.fromEntries(
      packages.map((fixturePackage) => [
        fixturePackage.name,
        buildMockPackage(fixturePackage.name, fixturePackage.version, {
          directoryPath: path.join(
            rootDirectoryPath,
            getFixturePackageDirectory(fixturePackage),
          ),
        }),
      ]),
    ),
  });
}

type PlanningResult = {
  plan: LoadedChangesetsPlan;
  candidates: ChangesetsCandidate[];
  run: () => ChangesetsReleasePlan;
};

/**
 * Loads a fixture and prepares a call to `planChangesetsRelease`.
 *
 * @param entries - The release spec entries.
 * @param options - The description of the fixture.
 * @returns The loaded plan, the candidates, and a function that plans the
 * release.
 */
async function prepareFixturePlanning(
  entries: Record<string, string | null>,
  options: ChangesetsFixtureOptions = FIXTURE,
): Promise<PlanningResult> {
  return await withChangesetsFixture(options, async (rootDirectoryPath) => {
    const project = buildFixtureProject(
      rootDirectoryPath,
      options.packages ?? [],
    );
    const plan = await loadChangesetsPlan(rootDirectoryPath);
    const candidates = await findChangesetsCandidates({ project, plan });
    return {
      plan,
      candidates,
      run: () =>
        planChangesetsRelease({
          project,
          plan,
          candidates,
          entries,
          releaseSpecificationPath: RELEASE_SPECIFICATION_PATH,
        }),
    };
  });
}

/**
 * Plans a release for a fixture.
 *
 * @param entries - The release spec entries.
 * @param options - The description of the fixture.
 * @returns The release plan.
 */
async function planFixtureRelease(
  entries: Record<string, string | null>,
  options: ChangesetsFixtureOptions = FIXTURE,
): Promise<ChangesetsReleasePlan> {
  const { run } = await prepareFixturePlanning(entries, options);
  return run();
}

/**
 * Builds the full error message for a list of plan-level problems.
 *
 * @param items - The problems.
 * @returns The error message.
 */
function buildErrorMessage(items: string[]): string {
  return [
    'Your release spec could not be processed due to the following issues:',
    items.map((item) => `* ${item}`).join('\n'),
    "The release spec file has been retained for you to edit again and make the necessary fixes. Once you've done this, re-run this tool.",
    RELEASE_SPECIFICATION_PATH,
  ].join('\n\n');
}

/**
 * Picks the name, type and versions of each release.
 *
 * @param releasePlan - The release plan.
 * @returns The summarized releases, sorted by name.
 */
function summarizeReleases(
  releasePlan: ChangesetsReleasePlan,
): Pick<
  ChangesetsReleasePlan['filteredPlan']['releases'][number],
  'name' | 'type' | 'oldVersion' | 'newVersion'
>[] {
  return releasePlan.filteredPlan.releases
    .map(({ name, type, oldVersion, newVersion }) => ({
      name,
      type,
      oldVersion,
      newVersion,
    }))
    .sort((left, right) => (left.name < right.name ? -1 : 1));
}

describe('changesets-release-plan', () => {
  describe('planChangesetsRelease', () => {
    it('re-plans the full release plan when the spec keeps the prefilled values', async () => {
      const { plan, run } = await prepareFixturePlanning(PREFILLED_ENTRIES);

      const result = run();

      expect(result.filteredPlan.releases).toStrictEqual(
        plan.fullPlan.releases,
      );
      expect(result.legacyReleases).toStrictEqual([]);
      expect(result.overrides).toStrictEqual([]);
    });

    it('lists the planned packages whose value in the spec differs from the plan, sorted by name', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/a': 'major',
        '@scope/b': '3.0.0',
        '@scope/e': 'patch',
        '@scope/h': 'minor',
      });

      expect(result.overrides).toStrictEqual([
        {
          name: '@scope/a',
          plannedType: 'minor',
          plannedVersion: '1.1.0',
          versionSpecifier: 'major',
          newVersion: '2.0.0',
        },
        {
          name: '@scope/b',
          plannedType: 'major',
          plannedVersion: '2.0.0',
          versionSpecifier: '3.0.0',
          newVersion: '3.0.0',
        },
        {
          name: '@scope/h',
          plannedType: 'patch',
          plannedVersion: '1.0.1',
          versionSpecifier: 'minor',
          newVersion: '1.1.0',
        },
      ]);
    });

    it('returns the selected changesets with the releases they keep', async () => {
      const { '@scope/a': _removed, ...entries } = PREFILLED_ENTRIES;

      const result = await planFixtureRelease(entries);

      expect(
        result.selectedChangesets.map(({ id, releases }) => ({
          id,
          releases,
        })),
      ).toStrictEqual([
        {
          id: 'calm-dogs-run',
          releases: [{ name: '@scope/b', type: 'major' }],
        },
        {
          id: 'eager-owls-fly',
          releases: [{ name: '@scope/d', type: 'minor' }],
        },
        {
          id: 'quiet-fish-nap',
          releases: [{ name: '@scope/f', type: 'none' }],
        },
      ]);
    });

    it('does not modify the loaded plan', async () => {
      const { plan, run } = await prepareFixturePlanning({
        ...PREFILLED_ENTRIES,
        '@scope/a': 'major',
        '@scope/b': '3.0.0',
        '@scope/c': 'minor',
        '@scope/e': 'patch',
      });
      const originalChangesets = structuredClone(plan.originalChangesets);
      const fullPlan = structuredClone(plan.fullPlan);

      run();

      expect(plan.originalChangesets).toStrictEqual(originalChangesets);
      expect(plan.fullPlan).toStrictEqual(fullPlan);
    });

    it('drops the releases of a removed direct package and keeps the other releases of a straddling changeset', async () => {
      const { '@scope/a': _removed, ...entries } = PREFILLED_ENTRIES;

      const result = await planFixtureRelease(entries);

      expect(
        result.filteredPlan.releases.map(({ name }) => name),
      ).not.toContain('@scope/a');
      expect(
        result.filteredPlan.changesets.map(({ id, releases }) => ({
          id,
          releases,
        })),
      ).toStrictEqual([
        {
          id: 'calm-dogs-run',
          releases: [{ name: '@scope/b', type: 'major' }],
        },
        {
          id: 'eager-owls-fly',
          releases: [{ name: '@scope/d', type: 'minor' }],
        },
        {
          id: 'quiet-fish-nap',
          releases: [{ name: '@scope/f', type: 'none' }],
        },
      ]);
    });

    it.each([null, 'intentionally-skip'])(
      'excludes a direct package listed with %s',
      async (directive) => {
        const result = await planFixtureRelease({
          ...PREFILLED_ENTRIES,
          '@scope/a': directive,
        });

        expect(
          result.filteredPlan.releases.map(({ name }) => name),
        ).not.toContain('@scope/a');
      },
    );

    it('rewrites the releases of a direct package overridden to major and adds its dependents', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/a': 'major',
        '@scope/e': 'patch',
      });

      expect(summarizeReleases(result)).toStrictEqual([
        {
          name: '@scope/a',
          type: 'major',
          oldVersion: '1.0.0',
          newVersion: '2.0.0',
        },
        {
          name: '@scope/b',
          type: 'major',
          oldVersion: '1.0.0',
          newVersion: '2.0.0',
        },
        {
          name: '@scope/c',
          type: 'patch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
        },
        {
          name: '@scope/d',
          type: 'minor',
          oldVersion: '0.1.0',
          newVersion: '0.2.0',
        },
        {
          name: '@scope/e',
          type: 'patch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
        },
        {
          name: '@scope/f',
          type: 'none',
          oldVersion: '1.0.0',
          newVersion: '1.0.0',
        },
        {
          name: '@scope/h',
          type: 'patch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
        },
      ]);
    });

    it('sets the exact version of a direct package', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/b': '3.0.0',
      });

      expect(
        result.filteredPlan.releases.find(({ name }) => name === '@scope/b'),
      ).toMatchObject({ type: 'major', newVersion: '3.0.0' });
    });

    it('maps a prerelease exact version of a direct package to its base bump type', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/a': '1.1.0-beta.0',
      });

      expect(
        result.filteredPlan.releases.find(({ name }) => name === '@scope/a'),
      ).toMatchObject({ type: 'minor', newVersion: '1.1.0-beta.0' });
      expect(
        result.filteredPlan.changesets
          .flatMap(({ releases }) => releases)
          .filter(({ name }) => name === '@scope/a'),
      ).toStrictEqual([
        { name: '@scope/a', type: 'minor' },
        { name: '@scope/a', type: 'minor' },
      ]);
    });

    it('rewrites every changeset of a direct package to the override type', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/a': 'patch',
      });

      expect(
        result.filteredPlan.releases.find(({ name }) => name === '@scope/a'),
      ).toMatchObject({ type: 'patch', newVersion: '1.0.1' });
    });

    it('keeps the none releases of an overridden direct package', async () => {
      const result = await planFixtureRelease(
        { '@scope/a': 'patch', '@scope/b': 'minor' },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            { name: '@scope/b', version: '1.0.0' },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'minor' },
              summary: 'Add a feature to a',
            },
            {
              id: 'calm-dogs-run',
              releases: { '@scope/a': 'none', '@scope/b': 'minor' },
              summary: 'Add a feature to b',
            },
          ],
        },
      );

      expect(
        result.filteredPlan.releases.find(({ name }) => name === '@scope/a'),
      ).toMatchObject({ type: 'patch', newVersion: '1.0.1' });
      expect(
        result.filteredPlan.changesets.map(({ id, releases }) => ({
          id,
          releases,
        })),
      ).toStrictEqual([
        {
          id: 'brave-cats-sing',
          releases: [{ name: '@scope/a', type: 'patch' }],
        },
        {
          id: 'calm-dogs-run',
          releases: [
            { name: '@scope/a', type: 'none' },
            { name: '@scope/b', type: 'minor' },
          ],
        },
      ]);
    });

    describe('when a propagated package is overridden with a higher bump', () => {
      const RAISING_FIXTURE: ChangesetsFixtureOptions = {
        packages: [
          { name: '@scope/b', version: '1.0.0' },
          {
            name: '@scope/c',
            version: '1.0.0',
            dependencies: { '@scope/b': '^1.0.0' },
          },
          {
            name: '@scope/k',
            version: '1.0.0',
            dependencies: { '@scope/c': '^1.0.0' },
          },
        ],
        changesets: [
          {
            id: 'calm-dogs-run',
            releases: { '@scope/b': 'major' },
            summary: 'Break b',
          },
        ],
      };

      it.each([
        ['major', '2.0.0'],
        ['2.0.0', '2.0.0'],
      ])(
        'releases it with %s and releases its listed dependents',
        async (specifier, newVersion) => {
          const result = await planFixtureRelease(
            {
              '@scope/b': 'major',
              '@scope/c': specifier,
              '@scope/k': 'patch',
            },
            RAISING_FIXTURE,
          );

          expect(summarizeReleases(result)).toStrictEqual([
            {
              name: '@scope/b',
              type: 'major',
              oldVersion: '1.0.0',
              newVersion: '2.0.0',
            },
            {
              name: '@scope/c',
              type: 'major',
              oldVersion: '1.0.0',
              newVersion,
            },
            {
              name: '@scope/k',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
            },
          ]);
        },
      );

      it('does not release it when the release that propagates it is excluded', async () => {
        await expect(
          planFixtureRelease(
            { '@scope/c': 'major', '@scope/k': 'patch' },
            RAISING_FIXTURE,
          ),
        ).rejects.toThrow(
          buildErrorMessage([
            '@scope/c is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.',
            '@scope/k is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.',
            'The release spec does not select any package to release.',
          ]),
        );
      });

      it('reports its unlisted dependents', async () => {
        await expect(
          planFixtureRelease(
            { '@scope/b': 'major', '@scope/c': 'major' },
            RAISING_FIXTURE,
          ),
        ).rejects.toThrow(
          buildErrorMessage([
            '@scope/k is released because dependency @scope/c is released as major, but it is not in the release spec. Add it with a version specifier, or mark it "intentionally-skip".',
          ]),
        );
      });

      it('leaves no trace of the in-memory changeset in the plan', async () => {
        const result = await planFixtureRelease(
          {
            '@scope/b': 'major',
            '@scope/c': 'major',
            '@scope/k': 'patch',
          },
          RAISING_FIXTURE,
        );

        expect(
          result.filteredPlan.changesets.map(({ id }) => id),
        ).toStrictEqual(['calm-dogs-run']);
        expect(result.selectedChangesets.map(({ id }) => id)).toStrictEqual([
          'calm-dogs-run',
        ]);
        expect(
          result.filteredPlan.releases.map(({ name, changesets }) => ({
            name,
            changesets,
          })),
        ).toStrictEqual([
          { name: '@scope/b', changesets: ['calm-dogs-run'] },
          { name: '@scope/c', changesets: [] },
          { name: '@scope/k', changesets: [] },
        ]);
      });
    });

    it('lowers a propagated release after re-planning', async () => {
      const result = await planFixtureRelease(
        { '@scope/b': 'major', '@scope/p': 'minor' },
        {
          packages: [
            { name: '@scope/b', version: '1.0.0' },
            {
              name: '@scope/p',
              version: '1.0.0',
              peerDependencies: { '@scope/b': '^1.0.0' },
            },
          ],
          changesets: [
            {
              id: 'calm-dogs-run',
              releases: { '@scope/b': 'major' },
              summary: 'Break b',
            },
          ],
        },
      );

      expect(summarizeReleases(result)).toStrictEqual([
        {
          name: '@scope/b',
          type: 'major',
          oldVersion: '1.0.0',
          newVersion: '2.0.0',
        },
        {
          name: '@scope/p',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        },
      ]);
    });

    it('removes a propagated package marked "intentionally-skip"', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/c': 'intentionally-skip',
        '@scope/h': 'intentionally-skip',
      });

      expect(
        result.filteredPlan.releases.map(({ name }) => name),
      ).not.toContain('@scope/c');
    });

    it.each([
      ['minor', 'minor', '1.1.0'],
      ['1.5.0', 'minor', '1.5.0'],
    ])(
      'overrides a propagated package with %s',
      async (specifier, type, newVersion) => {
        const result = await planFixtureRelease({
          ...PREFILLED_ENTRIES,
          '@scope/c': specifier,
        });

        expect(
          result.filteredPlan.releases.find(({ name }) => name === '@scope/c'),
        ).toMatchObject({ type, newVersion });
      },
    );

    it('reports a listed package with nothing to release', async () => {
      const { '@scope/b': _removed, ...entries } = PREFILLED_ENTRIES;

      await expect(planFixtureRelease(entries)).rejects.toThrow(
        buildErrorMessage([
          '@scope/c is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.',
          '@scope/h is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.',
        ]),
      );
    });

    it('reports an unlisted propagated release', async () => {
      const { '@scope/c': _removed, ...entries } = PREFILLED_ENTRIES;

      await expect(planFixtureRelease(entries)).rejects.toThrow(
        buildErrorMessage([
          '@scope/c is released because dependency @scope/b is released as major, but it is not in the release spec. Add it with a version specifier, or mark it "intentionally-skip".',
        ]),
      );
    });

    it('reports an unlisted peer dependent', async () => {
      await expect(
        planFixtureRelease(
          { '@scope/a': 'major' },
          {
            packages: [
              { name: '@scope/a', version: '1.0.0' },
              {
                name: '@scope/p',
                version: '1.0.0',
                peerDependencies: { '@scope/a': '^1.0.0' },
              },
            ],
            changesets: [
              {
                id: 'brave-cats-sing',
                releases: { '@scope/a': 'minor' },
                summary: 'Add a feature to a',
              },
            ],
          },
        ),
      ).rejects.toThrow(
        '@scope/p is released because peer dependency @scope/a is released as major, but it is not in the release spec.',
      );
    });

    it('reports an unlisted release that no dependency explains', async () => {
      await expect(
        planFixtureRelease(
          { '@scope/a': 'minor' },
          {
            packages: [
              { name: '@scope/a', version: '1.0.0' },
              { name: '@scope/n', version: '1.0.0' },
            ],
            changesets: [
              {
                id: 'brave-cats-sing',
                releases: { '@scope/a': 'minor' },
                summary: 'Add a feature to a',
              },
            ],
            config: { fixed: [['@scope/a', '@scope/n']] },
          },
        ),
      ).rejects.toThrow(
        buildErrorMessage([
          '@scope/n is released by the Changesets release plan, but it is not in the release spec. Add it with a version specifier, or mark it "intentionally-skip".',
        ]),
      );
    });

    it('does not report a listed release that no dependency explains', async () => {
      const result = await planFixtureRelease(
        { '@scope/a': 'minor', '@scope/n': 'minor' },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            { name: '@scope/n', version: '1.0.0' },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'minor' },
              summary: 'Add a feature to a',
            },
          ],
          config: { fixed: [['@scope/a', '@scope/n']] },
        },
      );

      expect(summarizeReleases(result)).toStrictEqual([
        {
          name: '@scope/a',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          name: '@scope/n',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        },
      ]);
    });

    it('reports a propagated release orphaned by a skip', async () => {
      await expect(
        planFixtureRelease({
          ...PREFILLED_ENTRIES,
          '@scope/c': 'intentionally-skip',
        }),
      ).rejects.toThrow(
        buildErrorMessage([
          '@scope/h is released only because of packages marked "intentionally-skip". Mark it "intentionally-skip" too.',
        ]),
      );
    });

    it('reports a spec that selects nothing', async () => {
      await expect(
        planFixtureRelease({
          '@scope/a': null,
          '@scope/b': null,
          '@scope/d': null,
          '@scope/l': null,
        }),
      ).rejects.toThrow(
        buildErrorMessage([
          'The release spec does not select any package to release.',
        ]),
      );
    });

    it('reports every problem in one error', async () => {
      await expect(
        planFixtureRelease({
          ...PREFILLED_ENTRIES,
          '@scope/a': 'major',
          '@scope/c': 'intentionally-skip',
          '@scope/n': 'patch',
        }),
      ).rejects.toThrow(
        buildErrorMessage([
          '@scope/e is released because dependency @scope/a is released as major, but it is not in the release spec. Add it with a version specifier, or mark it "intentionally-skip".',
          '@scope/h is released only because of packages marked "intentionally-skip". Mark it "intentionally-skip" too.',
          '@scope/n is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.',
        ]),
      );
    });

    it('releases a legacy candidate listed with a specifier', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/l': 'minor',
      });

      expect(result.legacyReleases).toStrictEqual([
        { name: '@scope/l', newVersion: '1.1.0' },
      ]);
    });

    it('releases a legacy candidate listed with an exact version', async () => {
      const result = await planFixtureRelease({
        ...PREFILLED_ENTRIES,
        '@scope/l': '4.0.0',
      });

      expect(result.legacyReleases).toStrictEqual([
        { name: '@scope/l', newVersion: '4.0.0' },
      ]);
    });

    it('releases a legacy candidate that only has a none release in the plan', async () => {
      const result = await planFixtureRelease(
        { '@scope/f': 'patch' },
        {
          packages: [
            {
              name: '@scope/f',
              version: '1.0.0',
              changelog: buildLegacyChangelog('@scope/f'),
            },
          ],
          changesets: [
            {
              id: 'quiet-fish-nap',
              releases: { '@scope/f': 'none' },
              summary: 'Touch f without releasing it',
            },
          ],
        },
      );

      expect(result.legacyReleases).toStrictEqual([
        { name: '@scope/f', newVersion: '1.0.1' },
      ]);
      expect(summarizeReleases(result)).toStrictEqual([
        {
          name: '@scope/f',
          type: 'none',
          oldVersion: '1.0.0',
          newVersion: '1.0.0',
        },
      ]);
    });

    it('releases a legacy candidate through the plan when the re-planned release bumps it', async () => {
      const result = await planFixtureRelease(
        { '@scope/a': 'major', '@scope/l': 'minor' },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            {
              name: '@scope/l',
              version: '1.0.0',
              peerDependencies: { '@scope/a': '^1.0.0' },
              changelog: buildLegacyChangelog('@scope/l'),
            },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'minor' },
              summary: 'Add a feature to a',
            },
          ],
        },
      );

      expect(result.legacyReleases).toStrictEqual([]);
      expect(summarizeReleases(result)).toStrictEqual([
        {
          name: '@scope/a',
          type: 'major',
          oldVersion: '1.0.0',
          newVersion: '2.0.0',
        },
        {
          name: '@scope/l',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        },
      ]);
    });

    it('keeps a changeset that only has none releases', async () => {
      const result = await planFixtureRelease(PREFILLED_ENTRIES);

      expect(
        result.filteredPlan.changesets.find(
          ({ id }) => id === 'quiet-fish-nap',
        ),
      ).toMatchObject({ releases: [{ name: '@scope/f', type: 'none' }] });
    });

    it('keeps the none releases of a kept changeset', async () => {
      const result = await planFixtureRelease(
        { '@scope/a': 'minor' },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            { name: '@scope/f', version: '1.0.0' },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'minor', '@scope/f': 'none' },
              summary: 'Add a feature to a',
            },
          ],
        },
      );

      expect(result.filteredPlan.changesets).toMatchObject([
        {
          id: 'brave-cats-sing',
          releases: [
            { name: '@scope/a', type: 'minor' },
            { name: '@scope/f', type: 'none' },
          ],
        },
      ]);
    });

    it('drops the none releases of a dropped changeset', async () => {
      const result = await planFixtureRelease(
        { '@scope/a': 'minor', '@scope/b': null },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            { name: '@scope/b', version: '1.0.0' },
            { name: '@scope/f', version: '1.0.0' },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'minor' },
              summary: 'Add a feature to a',
            },
            {
              id: 'calm-dogs-run',
              releases: { '@scope/b': 'major', '@scope/f': 'none' },
              summary: 'Break b',
            },
          ],
        },
      );

      expect(result.filteredPlan.changesets.map(({ id }) => id)).toStrictEqual([
        'brave-cats-sing',
      ]);
    });
  });
});
