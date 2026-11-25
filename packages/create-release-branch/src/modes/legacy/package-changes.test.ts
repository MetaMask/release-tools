import { describe, expect, it, vi } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import * as repoModule from '../../core/repo.js';
import { findLegacyPackageChanges } from './package-changes.js';

vi.mock('../../core/repo');

describe('legacy package changes', () => {
  describe('findLegacyPackageChanges', () => {
    it('flags a workspace package as changed when its tag exists and its directory changed', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root-package', '5.0.0'),
        workspacePackages: {
          '@scope/workspace-package': buildMockPackage(
            '@scope/workspace-package',
            '1.0.0',
          ),
        },
      });
      vi.when(vi.spyOn(repoModule, 'getTagNames'))
        .calledWith(project.directoryPath)
        .thenResolve(['v5.0.0', '@scope/workspace-package@1.0.0']);
      vi.when(vi.spyOn(repoModule, 'hasChangesInDirectorySinceGitTag'))
        .calledWith(
          project.directoryPath,
          project.workspacePackages['@scope/workspace-package'].directoryPath,
          '@scope/workspace-package@1.0.0',
        )
        .thenResolve(true);

      const result = await findLegacyPackageChanges(project);

      expect(result).toStrictEqual({
        changedPackageNames: new Set(['@scope/workspace-package']),
        packagesUsingRootTag: [],
      });
    });

    it('does not flag a workspace package as changed when its tag exists and its directory did not change', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root-package', '5.0.0'),
        workspacePackages: {
          '@scope/workspace-package': buildMockPackage(
            '@scope/workspace-package',
            '1.0.0',
          ),
        },
      });
      vi.when(vi.spyOn(repoModule, 'getTagNames'))
        .calledWith(project.directoryPath)
        .thenResolve(['v5.0.0', '@scope/workspace-package@1.0.0']);
      vi.when(vi.spyOn(repoModule, 'hasChangesInDirectorySinceGitTag'))
        .calledWith(
          project.directoryPath,
          project.workspacePackages['@scope/workspace-package'].directoryPath,
          '@scope/workspace-package@1.0.0',
        )
        .thenResolve(false);

      const result = await findLegacyPackageChanges(project);

      expect(result).toStrictEqual({
        changedPackageNames: new Set(),
        packagesUsingRootTag: [],
      });
    });

    it('falls back to the root tag and records packagesUsingRootTag in workspace order', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root-package', '5.0.0'),
        workspacePackages: {
          c: buildMockPackage('c', '1.0.0'),
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
        },
      });
      vi.when(vi.spyOn(repoModule, 'getTagNames'))
        .calledWith(project.directoryPath)
        .thenResolve(['v5.0.0', 'a@1.0.0']);
      const hasChangesMock = vi.spyOn(
        repoModule,
        'hasChangesInDirectorySinceGitTag',
      );
      vi.when(hasChangesMock)
        .calledWith(
          project.directoryPath,
          project.workspacePackages.c.directoryPath,
          'v5.0.0',
        )
        .thenResolve(true);
      vi.when(hasChangesMock)
        .calledWith(
          project.directoryPath,
          project.workspacePackages.a.directoryPath,
          'a@1.0.0',
        )
        .thenResolve(false);
      vi.when(hasChangesMock)
        .calledWith(
          project.directoryPath,
          project.workspacePackages.b.directoryPath,
          'v5.0.0',
        )
        .thenResolve(false);

      const result = await findLegacyPackageChanges(project);

      expect(result).toStrictEqual({
        changedPackageNames: new Set(['c']),
        packagesUsingRootTag: ['c', 'b'],
      });
    });

    it('flags every workspace package as changed if the project has no tags', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root-package', '5.0.0'),
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
        },
      });
      vi.when(vi.spyOn(repoModule, 'getTagNames'))
        .calledWith(project.directoryPath)
        .thenResolve([]);

      const result = await findLegacyPackageChanges(project);

      expect(result).toStrictEqual({
        changedPackageNames: new Set(['a']),
        packagesUsingRootTag: [],
      });
    });

    it('throws if the project has tags, but the root package has no tag for its current version', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('@scope/root', '1.0.0'),
      });
      vi.when(vi.spyOn(repoModule, 'getTagNames'))
        .calledWith(project.directoryPath)
        .thenResolve(['some-tag']);

      await expect(findLegacyPackageChanges(project)).rejects.toThrow(
        new Error(
          'The package @scope/root has no Git tag for its current version 1.0.0 (expected "v1.0.0"), so this tool is unable to determine whether it should be included in this release. You will need to create a tag for this package in order to proceed.',
        ),
      );
    });
  });
});
