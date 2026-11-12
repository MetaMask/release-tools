import { describe, expect, it } from 'vitest';

import {
  buildMockChangesetsState,
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import { compareNames, listChangesetsCandidates } from './candidates.js';

describe('candidates', () => {
  describe('listChangesetsCandidates', () => {
    it('lists the packages with changes, then with a dependency bump, each sorted by name', () => {
      const project = buildMockProject({
        workspacePackages: {
          '@scope/b': buildMockPackage('@scope/b', '1.0.0'),
          '@scope/a': buildMockPackage('@scope/a', '1.0.0'),
          '@scope/c': buildMockPackage('@scope/c', '1.0.0'),
          '@scope/z': buildMockPackage('@scope/z', '1.0.0'),
        },
      });
      const state = buildMockChangesetsState({
        fullPlan: {
          changesets: [
            {
              id: 'brave-cats-sing',
              summary: '',
              releases: [{ name: '@scope/b', type: 'major' }],
            },
            {
              id: 'calm-dogs-run',
              summary: '',
              releases: [
                { name: '@scope/a', type: 'patch' },
                { name: '@scope/b', type: 'patch' },
              ],
            },
            {
              id: 'eager-owls-fly',
              summary: '',
              releases: [{ name: '@scope/a', type: 'patch' }],
            },
          ],
          releases: [
            {
              name: '@scope/z',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
              changesets: [],
            },
            {
              name: '@scope/b',
              type: 'major',
              oldVersion: '1.0.0',
              newVersion: '2.0.0',
              changesets: ['brave-cats-sing', 'calm-dogs-run'],
            },
            {
              name: '@scope/c',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
              changesets: [],
            },
            {
              name: '@scope/a',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
              changesets: ['calm-dogs-run', 'eager-owls-fly'],
            },
          ],
          preState: undefined,
        },
      });

      expect(listChangesetsCandidates(project, state)).toStrictEqual([
        {
          name: '@scope/a',
          currentVersion: '1.0.0',
          plannedVersion: '1.0.1',
          kind: 'changes',
          changeCount: 2,
        },
        {
          name: '@scope/b',
          currentVersion: '1.0.0',
          plannedVersion: '2.0.0',
          kind: 'changes',
          changeCount: 2,
        },
        {
          name: '@scope/c',
          currentVersion: '1.0.0',
          plannedVersion: '1.0.1',
          kind: 'dependency',
        },
        {
          name: '@scope/z',
          currentVersion: '1.0.0',
          plannedVersion: '1.0.1',
          kind: 'dependency',
        },
      ]);
    });

    it('does not list or count a release of type "none"', () => {
      const project = buildMockProject({
        workspacePackages: {
          '@scope/a': buildMockPackage('@scope/a', '1.0.0'),
          '@scope/b': buildMockPackage('@scope/b', '1.0.0'),
        },
      });
      const state = buildMockChangesetsState({
        fullPlan: {
          changesets: [
            {
              id: 'brave-cats-sing',
              summary: '',
              releases: [
                { name: '@scope/a', type: 'none' },
                { name: '@scope/b', type: 'patch' },
              ],
            },
          ],
          releases: [
            {
              name: '@scope/a',
              type: 'none',
              oldVersion: '1.0.0',
              newVersion: '1.0.0',
              changesets: ['brave-cats-sing'],
            },
            {
              name: '@scope/b',
              type: 'patch',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
              changesets: ['brave-cats-sing'],
            },
          ],
          preState: undefined,
        },
      });

      expect(listChangesetsCandidates(project, state)).toStrictEqual([
        {
          name: '@scope/b',
          currentVersion: '1.0.0',
          plannedVersion: '1.0.1',
          kind: 'changes',
          changeCount: 1,
        },
      ]);
    });

    it('lists no package when there are no pending Changesets', () => {
      const project = buildMockProject({
        workspacePackages: {
          '@scope/a': buildMockPackage('@scope/a', '1.0.0'),
        },
      });

      expect(
        listChangesetsCandidates(project, buildMockChangesetsState()),
      ).toStrictEqual([]);
    });
  });

  describe('compareNames', () => {
    it('orders names by code unit', () => {
      expect(['b', 'B', 'a', 'a'].sort(compareNames)).toStrictEqual([
        'B',
        'a',
        'a',
        'b',
      ]);
    });
  });
});
