import { describe, expect, it } from 'vitest';

import { withChangesetsFixture } from '../tests/unit/changesets-fixture.js';
import type { ChangesetsFixtureOptions } from '../tests/unit/changesets-fixture.js';
import { loadChangesetsPlan } from './changesets-plan.js';

const FOUR_PACKAGES: ChangesetsFixtureOptions['packages'] = [
  { name: '@example/a', version: '1.0.0' },
  { name: '@example/b', version: '1.0.0' },
  {
    name: '@example/c',
    version: '1.0.0',
    dependencies: { '@example/b': '^1.0.0' },
  },
  { name: '@example/d', version: '0.1.0' },
];

describe('changesets-plan', () => {
  describe('loadChangesetsPlan', () => {
    it('returns the packages, the config, the full plan and the original Changesets', async () => {
      await withChangesetsFixture(
        {
          packages: FOUR_PACKAGES,
          changesets: [
            {
              id: 'brave-cats-sing',
              releases: { '@example/a': 'minor' },
              summary: 'Add a feature to a',
            },
            {
              id: 'calm-dogs-run',
              releases: { '@example/b': 'major' },
              summary: 'Break b',
            },
            {
              id: 'eager-owls-fly',
              releases: { '@example/a': 'patch', '@example/d': 'minor' },
              summary: 'Fix a and extend d',
            },
          ],
        },
        async (projectDirectoryPath) => {
          const { packages, config, fullPlan, originalChangesets } =
            await loadChangesetsPlan(projectDirectoryPath);

          expect(
            packages.packages.map(({ packageJson }) => packageJson.name).sort(),
          ).toStrictEqual([
            '@example/a',
            '@example/b',
            '@example/c',
            '@example/d',
          ]);
          expect(config.changelog).toStrictEqual([
            '@changesets/cli/changelog',
            null,
          ]);
          expect(
            fullPlan.releases
              .map(({ name, type, oldVersion, newVersion }) => ({
                name,
                type,
                oldVersion,
                newVersion,
              }))
              .sort((left, right) => left.name.localeCompare(right.name)),
          ).toStrictEqual([
            {
              name: '@example/a',
              type: 'minor',
              oldVersion: '1.0.0',
              newVersion: '1.1.0',
            },
            {
              name: '@example/b',
              type: 'major',
              oldVersion: '1.0.0',
              newVersion: '2.0.0',
            },
            {
              name: '@example/c',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
            },
            {
              name: '@example/d',
              type: 'minor',
              oldVersion: '0.1.0',
              newVersion: '0.2.0',
            },
          ]);
          expect(
            fullPlan.releases.find(({ name }) => name === '@example/c')
              ?.changesets,
          ).toStrictEqual([]);
          expect(
            originalChangesets
              .map(({ id, summary, releases }) => ({ id, summary, releases }))
              .sort((left, right) => left.id.localeCompare(right.id)),
          ).toStrictEqual([
            {
              id: 'brave-cats-sing',
              summary: 'Add a feature to a',
              releases: [{ name: '@example/a', type: 'minor' }],
            },
            {
              id: 'calm-dogs-run',
              summary: 'Break b',
              releases: [{ name: '@example/b', type: 'major' }],
            },
            {
              id: 'eager-owls-fly',
              summary: 'Fix a and extend d',
              releases: [
                { name: '@example/a', type: 'patch' },
                { name: '@example/d', type: 'minor' },
              ],
            },
          ]);
        },
      );
    });

    it('rejects an invalid Changesets configuration', async () => {
      await withChangesetsFixture(
        { packages: FOUR_PACKAGES, config: { access: 'nobody' } },
        async (projectDirectoryPath) => {
          await expect(
            loadChangesetsPlan(projectDirectoryPath),
          ).rejects.toThrow(/^Invalid Changesets configuration:\n.*access/u);
        },
      );
    });

    it('rejects pre mode', async () => {
      await withChangesetsFixture(
        {
          packages: FOUR_PACKAGES,
          preState: {
            mode: 'pre',
            tag: 'next',
            initialVersions: {
              '@example/a': '1.0.0',
              '@example/b': '1.0.0',
              '@example/c': '1.0.0',
              '@example/d': '0.1.0',
            },
            changesets: [],
          },
        },
        async (projectDirectoryPath) => {
          await expect(
            loadChangesetsPlan(projectDirectoryPath),
          ).rejects.toThrow(
            'Changesets pre mode is not supported by create-release-branch.',
          );
        },
      );
    });

    it('accepts a pre state that has exited pre mode', async () => {
      await withChangesetsFixture(
        {
          packages: FOUR_PACKAGES,
          preState: {
            mode: 'exit',
            tag: 'next',
            initialVersions: {
              '@example/a': '1.0.0',
              '@example/b': '1.0.0',
              '@example/c': '1.0.0',
              '@example/d': '0.1.0',
            },
            changesets: [],
          },
        },
        async (projectDirectoryPath) => {
          const { fullPlan } = await loadChangesetsPlan(projectDirectoryPath);

          expect(fullPlan.preState?.mode).toBe('exit');
        },
      );
    });

    it('rejects a configuration without a changelog setting', async () => {
      await withChangesetsFixture(
        { packages: FOUR_PACKAGES, config: { changelog: false } },
        async (projectDirectoryPath) => {
          await expect(
            loadChangesetsPlan(projectDirectoryPath),
          ).rejects.toThrow(
            'Changesets mode requires a "changelog" setting in .changeset/config.json.',
          );
        },
      );
    });

    it('rejects a Changeset that names an unknown package', async () => {
      await withChangesetsFixture(
        {
          packages: FOUR_PACKAGES,
          changesets: [
            {
              id: 'lost-fish-swim',
              releases: { '@example/unknown': 'minor' },
              summary: 'Change a package that does not exist',
            },
          ],
        },
        async (projectDirectoryPath) => {
          await expect(
            loadChangesetsPlan(projectDirectoryPath),
          ).rejects.toThrow(/lost-fish-swim/u);
        },
      );
    });
  });
});
