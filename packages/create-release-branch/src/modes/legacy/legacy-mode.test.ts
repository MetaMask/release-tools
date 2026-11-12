import { SemVer } from 'semver';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import type { Notice } from '../../core/notices.js';
import { IncrementableVersionParts } from '../../core/release-rules.js';
import * as projectModule from '../../project/project.js';
import * as fsModule from '../../utils/fs.js';
import { createLegacyMode } from './legacy-mode.js';
import * as releasePlanModule from './release-plan.js';
import type { ReleasePlan } from './release-plan.js';

vi.mock('../../project/project');
vi.mock('../../utils/fs');
vi.mock(import('./release-plan.js'), async (importActual) => ({
  ...(await importActual()),
  planRelease: vi.fn(),
  executeReleasePlan: vi.fn(),
}));

const notices: Notice[] = [
  { title: '1 changelog has no updates to make:', items: ['a'] },
];

describe('legacy mode', () => {
  describe('createLegacyMode', () => {
    it('names its prepare step after the changelog update', () => {
      const mode = createLegacyMode({
        project: buildMockProject(),
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(mode.prepare).toMatchObject({
        title: 'Updating changelogs',
        result: 'Updated changelogs',
      });
    });

    it('updates the changelogs of changed packages when preparing', async () => {
      const project = buildMockProject();
      const mode = createLegacyMode({
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      await mode.prepare.run();

      expect(
        projectModule.updateChangelogsForChangedPackages,
      ).toHaveBeenCalledWith({ project, formatter: 'prettier' });
    });

    it('prepare returns the grouped changelog notices', async () => {
      vi.mocked(
        projectModule.updateChangelogsForChangedPackages,
      ).mockResolvedValue(notices);
      const mode = createLegacyMode({
        project: buildMockProject(),
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(await mode.prepare.run()).toStrictEqual(notices);
    });

    it('lists the legacy candidates for the given choices', async () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', '1.0.0', {
            validatedManifest: { dependencies: { a: '1.0.0' } },
          }),
        },
      });
      const mode = createLegacyMode({
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(await mode.listCandidates({ a: 'major' })).toStrictEqual([
        { name: 'a', currentVersion: '1.0.0', kind: 'changes' },
        { name: 'b', currentVersion: '1.0.0', kind: 'dependency' },
      ]);
    });

    it('plan returns the released versions without the root', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root', '1.0.0'),
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
          c: buildMockPackage('c', '1.0.0'),
          d: buildMockPackage('d', '1.0.0'),
        },
      });
      const mode = createLegacyMode({
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      const result = await mode.plan({
        a: 'major',
        b: '1.2.3',
        c: 'intentionally-skip',
        d: null,
      });

      expect(result).toStrictEqual({
        plan: {
          releases: [
            { name: 'a', newVersion: '2.0.0' },
            { name: 'b', newVersion: '1.2.3' },
          ],
          data: {
            a: IncrementableVersionParts.major,
            b: new SemVer('1.2.3'),
          },
        },
      });
    });

    it('apply restores skipped changelogs before executing the plan', async () => {
      const project = buildMockProject();
      const releasePlan: ReleasePlan = { newVersion: '2.0.0', packages: [] };
      const releaseSpecificationPackages = {
        a: IncrementableVersionParts.major,
      };
      const calls: string[] = [];
      vi.mocked(
        projectModule.restoreChangelogsForSkippedPackages,
      ).mockImplementation(async () => {
        calls.push('restoreChangelogsForSkippedPackages');
      });
      vi.mocked(releasePlanModule.planRelease).mockImplementation(async () => {
        calls.push('planRelease');
        return releasePlan;
      });
      vi.mocked(releasePlanModule.executeReleasePlan).mockImplementation(
        async () => {
          calls.push('executeReleasePlan');
          return [];
        },
      );
      const mode = createLegacyMode({
        project,
        defaultBranch: 'main',
        formatter: 'oxfmt',
      });

      await mode.apply(
        { releases: [], data: releaseSpecificationPackages },
        '2.0.0',
      );

      expect(calls).toStrictEqual([
        'restoreChangelogsForSkippedPackages',
        'planRelease',
        'executeReleasePlan',
      ]);
      expect(
        projectModule.restoreChangelogsForSkippedPackages,
      ).toHaveBeenCalledWith({
        project,
        releaseSpecificationPackages,
        defaultBranch: 'main',
      });
      expect(releasePlanModule.planRelease).toHaveBeenCalledWith({
        project,
        releaseSpecificationPackages,
        newReleaseVersion: '2.0.0',
      });
      expect(releasePlanModule.executeReleasePlan).toHaveBeenCalledWith(
        project,
        releasePlan,
        'oxfmt',
      );
    });

    it('apply returns the grouped changelog notices', async () => {
      vi.mocked(releasePlanModule.executeReleasePlan).mockResolvedValue(
        notices,
      );
      const mode = createLegacyMode({
        project: buildMockProject(),
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(
        await mode.apply({ releases: [], data: {} }, '2.0.0'),
      ).toStrictEqual(notices);
    });

    it('getReleaseNotes returns the changelog', async () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', {
            changelogPath: '/path/to/packages/a/CHANGELOG.md',
          }),
        },
      });
      vi.when(vi.mocked(fsModule.readFile))
        .calledWith('/path/to/packages/a/CHANGELOG.md')
        .thenResolve('# Changelog');
      const mode = createLegacyMode({
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(await mode.getReleaseNotes('a')).toBe('# Changelog');
    });
  });
});
