import { describe, expect, it, vi } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../tests/unit/helpers.js';
import type { Candidate } from './candidates.js';
import type { Mode, ModePlan } from './mode.js';
import * as releaseBranchModule from './release-branch.js';
import {
  applyRelease,
  checkChoices,
  finishRelease,
  startRelease,
} from './release-steps.js';
import * as repoModule from './repo.js';
import * as yarnCommandsModule from './yarn-commands.js';

vi.mock('./release-branch');
vi.mock('./repo');
vi.mock('./yarn-commands');

/**
 * Builds a mode for use in tests. All methods are mock functions.
 *
 * @param overrides - The properties to override in the mode.
 * @returns The mock mode.
 */
function buildMockMode(overrides: Partial<Mode<string>> = {}): Mode<string> {
  return {
    name: 'legacy',
    allowEmptyInitializeCommit: false,
    prepare: vi.fn(),
    listCandidates: vi.fn().mockResolvedValue([]),
    plan: vi.fn(),
    apply: vi.fn(),
    getReleaseNotes: vi.fn(),
    ...overrides,
  };
}

describe('release-steps', () => {
  describe('startRelease', () => {
    it('prepares and commits only on the first run', async () => {
      const project = buildMockProject();
      const prepare = vi.fn();
      const mode = buildMockMode({ prepare });
      const createReleaseBranchSpy = vi.spyOn(
        releaseBranchModule,
        'createReleaseBranch',
      );
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');
      createReleaseBranchSpy.mockResolvedValueOnce({
        version: '2.0.0',
        firstRun: true,
      });
      createReleaseBranchSpy.mockResolvedValueOnce({
        version: '2.0.0',
        firstRun: false,
      });

      const firstResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
      });
      const secondResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
      });

      expect(firstResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(secondResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(createReleaseBranchSpy).toHaveBeenCalledWith({
        project,
        releaseType: 'ordinary',
      });
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 2.0.0',
        { allowEmpty: false },
      );
    });

    it('allows an empty Initialize commit when the mode asks', async () => {
      const project = buildMockProject();
      const mode = buildMockMode({ allowEmptyInitializeCommit: true });
      vi.spyOn(releaseBranchModule, 'createReleaseBranch').mockResolvedValue({
        version: '1.1.0',
        firstRun: true,
      });
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');

      await startRelease({ project, releaseType: 'backport', mode });

      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 1.1.0',
        { allowEmpty: true },
      );
    });
  });

  describe('checkChoices', () => {
    it('returns rule errors without planning', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const listCandidates = vi.fn().mockResolvedValue([]);
      const plan = vi.fn();
      const mode = buildMockMode({ listCandidates, plan });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'foo' },
      });

      expect(result).toStrictEqual({
        errors: [
          {
            message: [
              '"foo" is not a valid version specifier for package "a"',
              '(must be "major", "minor", or "patch"; or a version string with major, minor, and patch parts, such as "1.2.3")',
            ],
            entryIndex: 0,
          },
        ],
        dependencyFindings: {},
      });
      expect(listCandidates).toHaveBeenCalledWith({ a: 'foo' });
      expect(plan).not.toHaveBeenCalled();
    });

    it('returns mode plan errors', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const planErrors = [{ message: 'Nothing to release' }];
      const plan = vi.fn().mockResolvedValue({ errors: planErrors });
      const mode = buildMockMode({ plan });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'major' },
      });

      expect(result).toStrictEqual({
        errors: planErrors,
        dependencyFindings: {},
      });
      expect(plan).toHaveBeenCalledWith({ a: 'major' });
    });

    it('returns the mode plan when there are no errors', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const plan: ModePlan<string> = {
        releases: [{ name: 'a', newVersion: '2.0.0' }],
        data: 'data',
      };
      const mode = buildMockMode({
        plan: vi.fn().mockResolvedValue({ plan }),
      });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'major' },
      });

      expect(result).toStrictEqual({
        errors: [],
        dependencyFindings: {},
        plan,
      });
    });

    it('passes only changes and legacy-entries candidates as packages with changes', async () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0', {
            validatedManifest: {
              dependencies: { changed: '1.0.0', dependent: '1.0.0' },
              peerDependencies: { legacy: '1.0.0' },
            },
          }),
          changed: buildMockPackage('changed', '1.0.0'),
          dependent: buildMockPackage('dependent', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          legacy: buildMockPackage('legacy', '1.0.0'),
        },
      });
      const candidates: Candidate[] = [
        { name: 'changed', currentVersion: '1.0.0', kind: 'changes' },
        { name: 'dependent', currentVersion: '1.0.0', kind: 'dependency' },
        { name: 'legacy', currentVersion: '1.0.0', kind: 'legacy-entries' },
      ];
      const plan = vi.fn();
      const mode = buildMockMode({
        listCandidates: vi.fn().mockResolvedValue(candidates),
        plan,
      });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'minor' },
      });

      expect(result.dependencyFindings).toStrictEqual({
        a: {
          missingDirectDependentNames: [],
          missingPeerDependentNames: [],
          missingDependencies: ['changed', 'legacy'],
        },
      });
      expect(plan).not.toHaveBeenCalled();
    });
  });

  describe('applyRelease', () => {
    it('applies the plan with the new release version', async () => {
      const apply = vi.fn();
      const mode = buildMockMode({ apply });
      const plan: ModePlan<string> = { releases: [], data: 'data' };

      await applyRelease({ mode, plan, newReleaseVersion: '2.0.0' });

      expect(apply).toHaveBeenCalledWith(plan, '2.0.0');
    });
  });

  describe('finishRelease', () => {
    it('runs the Yarn steps then commits', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      vi.spyOn(yarnCommandsModule, 'fixConstraints').mockImplementation(
        async (directoryPath) => {
          calls.push(`fixConstraints ${directoryPath}`);
        },
      );
      vi.spyOn(yarnCommandsModule, 'updateYarnLockfile').mockImplementation(
        async (directoryPath) => {
          calls.push(`updateYarnLockfile ${directoryPath}`);
        },
      );
      vi.spyOn(
        yarnCommandsModule,
        'deduplicateDependencies',
      ).mockImplementation(async (directoryPath) => {
        calls.push(`deduplicateDependencies ${directoryPath}`);
      });
      vi.spyOn(repoModule, 'commitAllChanges').mockImplementation(
        async (directoryPath, commitMessage) => {
          calls.push(`commitAllChanges ${directoryPath} ${commitMessage}`);
        },
      );

      await finishRelease({ project, newReleaseVersion: '2.0.0' });

      expect(calls).toStrictEqual([
        'fixConstraints /path/to/project',
        'updateYarnLockfile /path/to/project',
        'deduplicateDependencies /path/to/project',
        'commitAllChanges /path/to/project Update Release 2.0.0',
      ]);
    });
  });
});
