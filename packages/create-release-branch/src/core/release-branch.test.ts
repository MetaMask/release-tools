import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../../tests/unit/helpers.js';
import {
  determineReleaseVersion,
  ensureReleaseBranch,
} from './release-branch.js';
import * as repoModule from './repo.js';

vi.mock('./repo');

describe('release-branch', () => {
  describe('determineReleaseVersion', () => {
    it('bumps major for ordinary and minor for backport', () => {
      const project = buildMockProject({
        releaseVersion: { ordinaryNumber: 3, backportNumber: 2 },
      });

      expect(determineReleaseVersion(project, 'ordinary')).toBe('4.0.0');
      expect(determineReleaseVersion(project, 'backport')).toBe('3.3.0');
    });
  });

  describe('ensureReleaseBranch', () => {
    it('reports the first run only when it creates the branch', async () => {
      const project = buildMockProject();
      vi.when(vi.spyOn(repoModule, 'getCurrentBranchName'))
        .calledWith(project.directoryPath)
        .thenResolve('main');
      vi.when(vi.spyOn(repoModule, 'branchExists'))
        .calledWith(project.directoryPath, 'release/2.0.0')
        .thenResolve(false);
      const runGitCommandWithin = vi.spyOn(repoModule, 'runGitCommandWithin');

      const result = await ensureReleaseBranch(project, '2.0.0');

      expect(result).toStrictEqual({ firstRun: true });
      expect(runGitCommandWithin).toHaveBeenCalledWith(
        project.directoryPath,
        'checkout',
        ['-b', 'release/2.0.0'],
      );
    });

    it('does not report the first run if the branch is already checked out', async () => {
      const project = buildMockProject();
      vi.when(vi.spyOn(repoModule, 'getCurrentBranchName'))
        .calledWith(project.directoryPath)
        .thenResolve('release/2.0.0');
      const runGitCommandWithin = vi.spyOn(repoModule, 'runGitCommandWithin');

      const result = await ensureReleaseBranch(project, '2.0.0');

      expect(result).toStrictEqual({ firstRun: false });
      expect(runGitCommandWithin).not.toHaveBeenCalled();
    });

    it('checks out the branch without reporting the first run if it already exists', async () => {
      const project = buildMockProject();
      vi.when(vi.spyOn(repoModule, 'getCurrentBranchName'))
        .calledWith(project.directoryPath)
        .thenResolve('main');
      vi.when(vi.spyOn(repoModule, 'branchExists'))
        .calledWith(project.directoryPath, 'release/1.1.0')
        .thenResolve(true);
      const runGitCommandWithin = vi.spyOn(repoModule, 'runGitCommandWithin');

      const result = await ensureReleaseBranch(project, '1.1.0');

      expect(result).toStrictEqual({ firstRun: false });
      expect(runGitCommandWithin).toHaveBeenCalledWith(
        project.directoryPath,
        'checkout',
        ['release/1.1.0'],
      );
    });
  });
});
