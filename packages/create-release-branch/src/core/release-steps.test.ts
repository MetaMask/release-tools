import { describe, expect, it, vi } from 'vitest';

import {
  buildMockMode,
  buildMockPackage,
  buildMockProject,
  createNoopCliOutput,
} from '../../tests/unit/helpers.js';
import type { Candidate } from './candidates.js';
import type { CliOutput } from './cli-output.js';
import type { ModePlan } from './mode.js';
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
 * Builds an output that records when each step starts and ends.
 *
 * @param calls - The list to which the start and end of each step are added.
 * @returns The output.
 */
function buildRecordingOutput(calls: string[]): CliOutput {
  return {
    ...createNoopCliOutput(),
    async step(label, run) {
      calls.push(`start ${label}`);
      const result = await run();
      calls.push(`end ${label}`);
      return result;
    },
  };
}

describe('release-steps', () => {
  describe('startRelease', () => {
    it('prepares and commits only on the first run', async () => {
      const project = buildMockProject();
      const prepare = vi.fn();
      const mode = buildMockMode({ prepare });
      const determineReleaseVersionSpy = vi
        .spyOn(releaseBranchModule, 'determineReleaseVersion')
        .mockReturnValue('2.0.0');
      const ensureReleaseBranchSpy = vi.spyOn(
        releaseBranchModule,
        'ensureReleaseBranch',
      );
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');
      ensureReleaseBranchSpy.mockResolvedValueOnce({ firstRun: true });
      ensureReleaseBranchSpy.mockResolvedValueOnce({ firstRun: false });

      const firstResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: createNoopCliOutput(),
      });
      const secondResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: createNoopCliOutput(),
      });

      expect(firstResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(secondResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(determineReleaseVersionSpy).toHaveBeenCalledWith(
        project,
        'ordinary',
      );
      expect(ensureReleaseBranchSpy).toHaveBeenCalledWith(project, '2.0.0');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 2.0.0',
        { allowEmpty: true },
      );
    });

    it('prepares in a step before the Initialize commit', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      const mode = buildMockMode({
        prepare: vi.fn().mockImplementation(async () => {
          calls.push('prepare');
        }),
      });
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockImplementation(
        async () => {
          calls.push('ensureReleaseBranch');
          return { firstRun: true };
        },
      );
      vi.spyOn(repoModule, 'commitAllChanges').mockImplementation(
        async (directoryPath, commitMessage) => {
          calls.push(`commitAllChanges ${directoryPath} ${commitMessage}`);
        },
      );

      await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Creating the release branch',
        'ensureReleaseBranch',
        'end Creating the release branch',
        'start Updating changelogs',
        'prepare',
        'end Updating changelogs',
        'commitAllChanges /path/to/project Initialize Release 2.0.0',
      ]);
    });

    it('only creates the release branch after the first run', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });

      await startRelease({
        project,
        releaseType: 'ordinary',
        mode: buildMockMode(),
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Creating the release branch',
        'end Creating the release branch',
      ]);
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
    it('applies the plan with the new release version in a step', async () => {
      const calls: string[] = [];
      const apply = vi.fn().mockImplementation(async () => {
        calls.push('apply');
      });
      const mode = buildMockMode({ apply });
      const plan: ModePlan<string> = { releases: [], data: 'data' };

      await applyRelease({
        mode,
        plan,
        newReleaseVersion: '2.0.0',
        output: buildRecordingOutput(calls),
      });

      expect(apply).toHaveBeenCalledWith(plan, '2.0.0');
      expect(calls).toStrictEqual([
        'start Applying the release',
        'apply',
        'end Applying the release',
      ]);
    });
  });

  describe('finishRelease', () => {
    it('runs each Yarn command in a step, then commits outside any step', async () => {
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

      await finishRelease({
        project,
        newReleaseVersion: '2.0.0',
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Fixing Yarn constraints',
        'fixConstraints /path/to/project',
        'end Fixing Yarn constraints',
        'start Installing dependencies',
        'updateYarnLockfile /path/to/project',
        'end Installing dependencies',
        'start Deduplicating dependencies',
        'deduplicateDependencies /path/to/project',
        'end Deduplicating dependencies',
        'commitAllChanges /path/to/project Update Release 2.0.0',
      ]);
    });
  });
});
