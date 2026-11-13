import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { defaultConfig } from '@changesets/config';
import type {
  Config,
  NewChangeset,
  Packages,
  VersionType,
} from '@changesets/types';
import { describe, expect, it } from 'vitest';

import {
  buildMockChangesetsState,
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import type { Candidate } from '../../core/candidates.js';
import type { ModePlan, ModePlanResult } from '../../core/mode.js';
import type { ReleaseChoices } from '../../core/release-rules.js';
import type { Project } from '../../project/project.js';
import { compareNames, listChangesetsCandidates } from './candidates.js';
import type { ChangesetsState } from './load.js';
import { planChangesetsRelease } from './plan.js';
import type { ChangesetsPlanData } from './plan.js';

/**
 * A workspace package of a fixture.
 */
type FixturePackage = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * A pending Changeset of a fixture.
 */
type FixtureChangeset = {
  id: string;
  releases: Record<string, VersionType>;
  summary: string;
};

/**
 * The workspace packages, the pending Changesets, and the Changesets
 * configuration of a fixture.
 */
type FixtureOptions = {
  packages: FixturePackage[];
  changesets?: FixtureChangeset[];
  config?: Partial<Config>;
};

const FIXTURE: FixtureOptions = {
  packages: [
    { name: '@scope/a', version: '1.0.0' },
    { name: '@scope/b', version: '1.0.0' },
    {
      name: '@scope/c',
      version: '1.0.0',
      dependencies: { '@scope/b': '^1.0.0' },
    },
    { name: '@scope/d', version: '0.1.0' },
    { name: '@scope/f', version: '1.0.0' },
    {
      name: '@scope/h',
      version: '1.0.0',
      dependencies: { '@scope/c': '1.0.0' },
    },
    { name: '@scope/n', version: '1.0.0' },
  ],
  changesets: [
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
  ],
};

/**
 * The choices that keep the bumps that the Changesets give for `FIXTURE`.
 */
const PROPOSED_CHOICES: ReleaseChoices = {
  '@scope/a': 'minor',
  '@scope/b': 'major',
  '@scope/d': 'minor',
  '@scope/c': 'patch',
  '@scope/h': 'patch',
};

/**
 * Builds the project and the Changesets state of a fixture, and lists its
 * candidates. The Changesets are sorted by id, as Changesets reads them.
 *
 * @param options - The fixture.
 * @returns The project, the state, and the candidates.
 */
function loadFixture(options: FixtureOptions): {
  project: Project;
  state: ChangesetsState;
  candidates: Candidate[];
} {
  const { packages, changesets = [], config = {} } = options;
  const project = buildMockProject({
    workspacePackages: Object.fromEntries(
      packages.map(({ name, version }) => [
        name,
        buildMockPackage(name, version),
      ]),
    ),
  });

  const changesetsPackages: Packages = {
    rootDir: project.directoryPath,
    rootPackage: {
      dir: project.directoryPath,
      packageJson: { name: 'root', version: '0.0.0', private: true },
    },
    packages: packages.map((packageJson) => ({
      dir: project.workspacePackages[packageJson.name].directoryPath,
      packageJson,
    })),
    tool: { type: 'yarn' },
  };
  const fullConfig: Config = { ...defaultConfig, ...config };
  const pendingChangesets = changesets
    .map(
      ({ id, releases, summary }): NewChangeset => ({
        id,
        summary,
        releases: Object.entries(releases).map(([name, type]) => ({
          name,
          type,
        })),
      }),
    )
    .sort((left, right) => compareNames(left.id, right.id));
  const state = buildMockChangesetsState({
    packages: changesetsPackages,
    config: fullConfig,
    fullPlan: assembleReleasePlan(
      pendingChangesets,
      changesetsPackages,
      fullConfig,
      undefined,
    ),
  });

  return {
    project,
    state,
    candidates: listChangesetsCandidates(project, state),
  };
}

/**
 * Plans a release of a fixture with the given choices.
 *
 * @param choices - The release choices.
 * @param options - The fixture.
 * @returns The state and the result.
 */
function planFixture(
  choices: ReleaseChoices,
  options: FixtureOptions = FIXTURE,
): {
  state: ChangesetsState;
  result: ModePlanResult<ChangesetsPlanData>;
} {
  const input = loadFixture(options);
  return {
    state: input.state,
    result: planChangesetsRelease({ ...input, choices }),
  };
}

/**
 * Plans a release with the given choices, and returns the state and the plan.
 *
 * @param choices - The release choices.
 * @param options - The description of the fixture.
 * @returns The state and the plan.
 * @throws If the result has errors instead of a plan.
 */
function planFixturePlan(
  choices: ReleaseChoices,
  options: FixtureOptions = FIXTURE,
): { state: ChangesetsState; plan: ModePlan<ChangesetsPlanData> } {
  const { state, result } = planFixture(choices, options);
  if (!('plan' in result)) {
    throw new Error(`Expected a plan, got: ${JSON.stringify(result.errors)}`);
  }
  return { state, plan: result.plan };
}

/**
 * Plans a release with the given choices, and returns the plan data.
 *
 * @param choices - The release choices.
 * @param options - The description of the fixture.
 * @returns The plan data.
 */
function planFixtureData(
  choices: ReleaseChoices,
  options: FixtureOptions = FIXTURE,
): ChangesetsPlanData {
  return planFixturePlan(choices, options).plan.data;
}

/**
 * Plans a release with the given choices, and returns the errors.
 *
 * @param choices - The release choices.
 * @param options - The description of the fixture.
 * @returns The errors.
 */
function planFixtureErrors(
  choices: ReleaseChoices,
  options: FixtureOptions = FIXTURE,
): unknown {
  const { result } = planFixture(choices, options);
  return 'errors' in result ? result.errors : result;
}

/**
 * Picks the name and the new version of each release of the filtered plan.
 *
 * @param data - The plan data.
 * @returns The names and new versions, sorted by name.
 */
function summarizeVersions(
  data: ChangesetsPlanData,
): [string, string | undefined][] {
  return data.filteredPlan.releases
    .map(({ name, newVersion }): [string, string | undefined] => [
      name,
      newVersion,
    ])
    .sort(([left], [right]) => compareNames(left, right));
}

/**
 * Picks the id and the releases of each Changeset.
 *
 * @param changesets - The Changesets.
 * @returns The ids and releases.
 */
function summarizeChangesets(
  changesets: ChangesetsPlanData['selectedChangesets'],
): { id: string; releases: unknown }[] {
  return changesets.map(({ id, releases }) => ({ id, releases }));
}

/**
 * Builds the error for a choice that does not give the version that the
 * Changesets give.
 *
 * @param args - The arguments.
 * @param args.packageName - The name of the package.
 * @param args.entryIndex - The index of the choice in the release spec.
 * @param args.choice - The choice.
 * @param args.newVersion - The version that the Changesets give.
 * @param args.proposed - The value that gives this version.
 * @returns The error.
 */
function buildChangedVersionError({
  packageName,
  entryIndex,
  choice,
  newVersion,
  proposed,
}: {
  packageName: string;
  entryIndex: number;
  choice: string;
  newVersion: string;
  proposed: string;
}): unknown {
  return {
    packageName,
    entryIndex,
    problem: `is set to ${choice}, but the Changesets release it as ${newVersion}`,
    hint: `Set it to ${proposed}. You cannot change the version of a package in Changesets mode.`,
  };
}

const UNLISTED_HINT =
  'Add it with a version specifier, or set it to intentionally-skip.';

const NOTHING_TO_RELEASE = {
  problem:
    'has nothing to release: no selected Changeset and no dependency bump',
  hint: 'Remove it, set it to intentionally-skip, or add a Changeset for it.',
};

describe('plan', () => {
  describe('planChangesetsRelease', () => {
    it('plans the full release when the choices keep the proposed bumps', () => {
      const { state, plan } = planFixturePlan(PROPOSED_CHOICES);

      expect(plan.releases).toStrictEqual([
        { name: '@scope/a', newVersion: '1.1.0' },
        { name: '@scope/b', newVersion: '2.0.0' },
        { name: '@scope/c', newVersion: '1.0.1' },
        { name: '@scope/d', newVersion: '0.2.0' },
        { name: '@scope/h', newVersion: '1.0.1' },
      ]);
      expect(plan.data.state).toBe(state);
      expect(plan.data.filteredPlan.releases).toStrictEqual(
        state.fullPlan.releases,
      );
    });

    it.each([
      ['@scope/b', '2.0.0'],
      ['@scope/c', '1.0.1'],
    ])(
      'accepts the exact version that the Changesets give to %s',
      (packageName, newVersion) => {
        const { plan } = planFixturePlan({
          ...PROPOSED_CHOICES,
          [packageName]: newVersion,
        });

        expect(plan.releases).toContainEqual({ name: packageName, newVersion });
      },
    );

    it.each([
      { packageName: '@scope/a', choice: 'major', entryIndex: 0 },
      { packageName: '@scope/a', choice: 'patch', entryIndex: 0 },
      { packageName: '@scope/a', choice: '1.2.0', entryIndex: 0 },
    ])(
      'reports a package with changes set to $choice instead of the version that its Changesets give',
      ({ packageName, choice, entryIndex }) => {
        const errors = planFixtureErrors({
          ...PROPOSED_CHOICES,
          [packageName]: choice,
        });

        expect(errors).toStrictEqual([
          buildChangedVersionError({
            packageName,
            entryIndex,
            choice,
            newVersion: '1.1.0',
            proposed: 'minor',
          }),
        ]);
      },
    );

    it('reports a dependency bump set to another version than the one that the Changesets give', () => {
      const errors = planFixtureErrors({
        ...PROPOSED_CHOICES,
        '@scope/c': 'minor',
      });

      expect(errors).toStrictEqual([
        buildChangedVersionError({
          packageName: '@scope/c',
          entryIndex: 3,
          choice: 'minor',
          newVersion: '1.0.1',
          proposed: 'patch',
        }),
      ]);
    });

    it('drops the releases of a package left out, and keeps the other releases of a Changeset that it shares', () => {
      const { '@scope/a': _leftOut, ...choices } = PROPOSED_CHOICES;

      const data = planFixtureData(choices);

      expect(data.filteredPlan.releases.map(({ name }) => name)).not.toContain(
        '@scope/a',
      );
      const expectedChangesets = [
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
      ];
      expect(summarizeChangesets(data.selectedChangesets)).toStrictEqual(
        expectedChangesets,
      );
      expect(summarizeChangesets(data.filteredPlan.changesets)).toStrictEqual(
        expectedChangesets,
      );
    });

    it('does not change the state', () => {
      const { project, state, candidates } = loadFixture(FIXTURE);
      const fullPlan = structuredClone(state.fullPlan);

      planChangesetsRelease({
        project,
        state,
        candidates,
        choices: { ...PROPOSED_CHOICES, '@scope/a': null },
      });

      expect(state.fullPlan).toStrictEqual(fullPlan);
    });

    it.each([null, 'intentionally-skip'])(
      'leaves out a package with changes whose choice is %s',
      (choice) => {
        const data = planFixtureData({
          ...PROPOSED_CHOICES,
          '@scope/a': choice,
        });

        expect(
          data.filteredPlan.releases.map(({ name }) => name),
        ).not.toContain('@scope/a');
      },
    );

    it('keeps a Changeset that only has none releases', () => {
      const data = planFixtureData(PROPOSED_CHOICES);

      expect(
        data.filteredPlan.changesets.find(({ id }) => id === 'quiet-fish-nap'),
      ).toMatchObject({ releases: [{ name: '@scope/f', type: 'none' }] });
    });

    it('keeps the none releases of a kept Changeset', () => {
      const data = planFixtureData(
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

      expect(summarizeChangesets(data.filteredPlan.changesets)).toStrictEqual([
        {
          id: 'brave-cats-sing',
          releases: [
            { name: '@scope/a', type: 'minor' },
            { name: '@scope/f', type: 'none' },
          ],
        },
      ]);
    });

    it('drops a Changeset of a package left out with its none releases', () => {
      const data = planFixtureData(
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

      expect(data.filteredPlan.changesets.map(({ id }) => id)).toStrictEqual([
        'brave-cats-sing',
      ]);
    });

    it('leaves out dependency bumps set to intentionally-skip', () => {
      const data = planFixtureData({
        ...PROPOSED_CHOICES,
        '@scope/c': 'intentionally-skip',
        '@scope/h': 'intentionally-skip',
      });

      expect(data.filteredPlan.releases.map(({ name }) => name)).not.toContain(
        '@scope/c',
      );
      expect(data.filteredPlan.releases.map(({ name }) => name)).not.toContain(
        '@scope/h',
      );
    });

    it('reports the chosen packages that have nothing to release', () => {
      const { '@scope/b': _leftOut, ...choices } = PROPOSED_CHOICES;

      const errors = planFixtureErrors(choices);

      expect(errors).toStrictEqual([
        { packageName: '@scope/c', entryIndex: 2, ...NOTHING_TO_RELEASE },
        { packageName: '@scope/h', entryIndex: 3, ...NOTHING_TO_RELEASE },
      ]);
    });

    it('reports a dependency bump that is not in the choices', () => {
      const { '@scope/c': _leftOut, ...choices } = PROPOSED_CHOICES;

      const errors = planFixtureErrors(choices);

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/c',
          problem:
            'is released because dependency @scope/b is released as major, but it is not in the release spec',
          hint: UNLISTED_HINT,
        },
      ]);
    });

    it('reports a peer dependent that is not in the choices', () => {
      const errors = planFixtureErrors(
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
              releases: { '@scope/a': 'major' },
              summary: 'Break a',
            },
          ],
        },
      );

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/p',
          problem:
            'is released because peer dependency @scope/a is released as major, but it is not in the release spec',
          hint: UNLISTED_HINT,
        },
      ]);
    });

    it('explains a dependency bump that an optional dependency causes', () => {
      const errors = planFixtureErrors(
        { '@scope/b': 'major' },
        {
          packages: [
            { name: '@scope/b', version: '1.0.0' },
            {
              name: '@scope/c',
              version: '1.0.0',
              optionalDependencies: { '@scope/b': '^1.0.0' },
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

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/c',
          problem:
            'is released because dependency @scope/b is released as major, but it is not in the release spec',
          hint: UNLISTED_HINT,
        },
      ]);
    });

    it('names the first released dependency by name', () => {
      const errors = planFixtureErrors(
        { '@scope/b': 'major', '@scope/a': 'major' },
        {
          packages: [
            { name: '@scope/a', version: '1.0.0' },
            { name: '@scope/b', version: '1.0.0' },
            {
              name: '@scope/c',
              version: '1.0.0',
              dependencies: { '@scope/b': '^1.0.0', '@scope/a': '^1.0.0' },
            },
          ],
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@scope/a': 'major', '@scope/b': 'major' },
              summary: 'Break a and b',
            },
          ],
        },
      );

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/c',
          problem:
            'is released because dependency @scope/a is released as major, but it is not in the release spec',
          hint: UNLISTED_HINT,
        },
      ]);
    });

    it('reports a release that is not in the choices and that no dependency explains', () => {
      const errors = planFixtureErrors(
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
      );

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/n',
          problem:
            'is released by the Changesets release plan, but it is not in the release spec',
          hint: UNLISTED_HINT,
        },
      ]);
    });

    it('releases a package of a fixed group that is in the choices', () => {
      const data = planFixtureData(
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

      expect(summarizeVersions(data)).toStrictEqual([
        ['@scope/a', '1.1.0'],
        ['@scope/n', '1.1.0'],
      ]);
    });

    describe('with a linked group', () => {
      const LINKED_FIXTURE: FixtureOptions = {
        packages: [
          { name: '@scope/a', version: '2.0.0' },
          { name: '@scope/n', version: '1.0.0' },
        ],
        changesets: [
          {
            id: 'brave-cats-sing',
            releases: { '@scope/a': 'minor' },
            summary: 'Add a feature to a',
          },
          {
            id: 'calm-dogs-run',
            releases: { '@scope/n': 'patch' },
            summary: 'Fix n',
          },
        ],
        config: { linked: [['@scope/a', '@scope/n']] },
      };

      it('gives a package the higher version of its group', () => {
        const data = planFixtureData(
          { '@scope/a': 'minor', '@scope/n': '2.1.0' },
          LINKED_FIXTURE,
        );

        expect(summarizeVersions(data)).toStrictEqual([
          ['@scope/a', '2.1.0'],
          ['@scope/n', '2.1.0'],
        ]);
      });

      it.each(['patch', 'minor'])(
        'reports a package set to %s, and gives the exact version in the hint because no bump type gives it',
        (choice) => {
          const errors = planFixtureErrors(
            { '@scope/a': 'minor', '@scope/n': choice },
            LINKED_FIXTURE,
          );

          expect(errors).toStrictEqual([
            buildChangedVersionError({
              packageName: '@scope/n',
              entryIndex: 1,
              choice,
              newVersion: '2.1.0',
              proposed: '2.1.0',
            }),
          ]);
        },
      );
    });

    it('reports a dependency bump that only packages set to intentionally-skip cause', () => {
      const errors = planFixtureErrors({
        ...PROPOSED_CHOICES,
        '@scope/c': 'intentionally-skip',
      });

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/h',
          entryIndex: 4,
          problem:
            'is released only because of packages set to intentionally-skip',
          hint: 'Set it to intentionally-skip too.',
        },
      ]);
    });

    it('reports a dependency bump that only packages set to intentionally-skip cause, when it is not in the choices', () => {
      const { '@scope/h': _leftOut, ...choices } = PROPOSED_CHOICES;

      const errors = planFixtureErrors({
        ...choices,
        '@scope/c': 'intentionally-skip',
      });

      expect(errors).toStrictEqual([
        {
          packageName: '@scope/h',
          problem:
            'is released only because of packages set to intentionally-skip',
          hint: 'Set it to intentionally-skip too.',
        },
      ]);
    });

    it('reports choices that release no package', () => {
      const errors = planFixtureErrors({
        '@scope/a': null,
        '@scope/b': null,
        '@scope/d': null,
      });

      expect(errors).toStrictEqual([
        {
          problem: 'does not release any package',
          hint: 'Set a version specifier for at least one package.',
        },
      ]);
    });

    it('reports every problem at once', () => {
      const errors = planFixtureErrors({
        ...PROPOSED_CHOICES,
        '@scope/a': 'major',
        '@scope/c': 'intentionally-skip',
        '@scope/n': 'patch',
      });

      expect(errors).toStrictEqual([
        buildChangedVersionError({
          packageName: '@scope/a',
          entryIndex: 0,
          choice: 'major',
          newVersion: '1.1.0',
          proposed: 'minor',
        }),
        {
          packageName: '@scope/h',
          entryIndex: 4,
          problem:
            'is released only because of packages set to intentionally-skip',
          hint: 'Set it to intentionally-skip too.',
        },
        { packageName: '@scope/n', entryIndex: 5, ...NOTHING_TO_RELEASE },
      ]);
    });
  });
});
