import * as actionUtils from '@metamask/action-utils';
import { mkdir } from 'fs/promises';
import path from 'path';
import { SemVer } from 'semver';
import { describe, expect, it, vi } from 'vitest';

import { withProtectedProcessEnv, withSandbox } from '../../tests/helpers.js';
import {
  buildMockPackage,
  buildMockProject,
} from '../../tests/unit/helpers.js';
import { IncrementableVersionParts } from '../core/release-rules.js';
import * as repoModule from '../core/repo.js';
import * as fs from '../utils/fs.js';
import * as miscUtils from '../utils/misc-utils.js';
import * as packageModule from './package.js';
import {
  buildChangelogNotices,
  getValidRepositoryUrl,
  readProject,
  restoreChangelogsForSkippedPackages,
  updateChangelogsForChangedPackages,
} from './project.js';

vi.mock('./package');
vi.mock('../core/repo');
vi.mock('@metamask/action-utils', async () => ({
  ...(await vi.importActual('@metamask/action-utils')),
  getWorkspaceLocations: vi.fn(),
}));

describe('project', () => {
  describe('readProject', () => {
    it('collects information about the repository URL, release version, and packages in the project', async () => {
      await withSandbox(async (sandbox) => {
        const projectDirectoryPath = sandbox.directoryPath;
        const projectRepositoryUrl = 'https://github.com/some-org/some-repo';
        const rootPackageName = 'root';
        const rootPackageVersion = new SemVer('4.38.0');
        const rootPackage = buildMockPackage(
          rootPackageName,
          rootPackageVersion,
          {
            directoryPath: projectDirectoryPath,
            validatedManifest: {
              workspaces: ['packages/a', 'packages/subpackages/*'],
            },
            unvalidatedManifest: {
              repository: {
                url: projectRepositoryUrl,
              },
            },
          },
        );
        const workspacePackages = {
          a: buildMockPackage('a', {
            directoryPath: path.join(projectDirectoryPath, 'packages', 'a'),
          }),
          b: buildMockPackage('b', {
            directoryPath: path.join(
              projectDirectoryPath,
              'packages',
              'subpackages',
              'b',
            ),
          }),
        };
        vi.when(vi.spyOn(packageModule, 'readPackage'))
          .calledWith(projectDirectoryPath)
          .thenResolve(rootPackage);
        vi.when(vi.spyOn(actionUtils, 'getWorkspaceLocations'))
          .calledWith(
            rootPackage.validatedManifest.workspaces,
            projectDirectoryPath,
            true,
          )
          .thenResolve(['packages/a', 'packages/subpackages/b']);
        const readPackageMock = vi.spyOn(packageModule, 'readPackage');
        vi.when(readPackageMock)
          .calledWith(path.join(projectDirectoryPath, 'packages', 'a'))
          .thenResolve(workspacePackages.a);
        vi.when(readPackageMock)
          .calledWith(
            path.join(projectDirectoryPath, 'packages', 'subpackages', 'b'),
          )
          .thenResolve(workspacePackages.b);
        await mkdir(path.join(projectDirectoryPath, 'packages'));
        await mkdir(path.join(projectDirectoryPath, 'packages', 'a'));
        await mkdir(path.join(projectDirectoryPath, 'packages', 'subpackages'));
        await mkdir(
          path.join(projectDirectoryPath, 'packages', 'subpackages', 'b'),
        );

        expect(await readProject(projectDirectoryPath)).toStrictEqual({
          directoryPath: projectDirectoryPath,
          repositoryUrl: projectRepositoryUrl,
          rootPackage,
          workspacePackages,
          isMonorepo: true,
          releaseVersion: {
            ordinaryNumber: 4,
            backportNumber: 38,
          },
        });
      });
    });

    it('preserves workspace order when listing workspace packages', async () => {
      await withSandbox(async (sandbox) => {
        const projectDirectoryPath = sandbox.directoryPath;
        const rootPackage = buildMockPackage('root', '1.0.0', {
          directoryPath: projectDirectoryPath,
          validatedManifest: { workspaces: ['packages/*'] },
          unvalidatedManifest: { repository: 'https://github.com/org/repo' },
        });
        vi.when(vi.spyOn(packageModule, 'readPackage'))
          .calledWith(projectDirectoryPath)
          .thenResolve(rootPackage);
        vi.spyOn(actionUtils, 'getWorkspaceLocations').mockResolvedValue([
          'packages/c',
          'packages/a',
          'packages/b',
        ]);
        const readPackageMock = vi.spyOn(packageModule, 'readPackage');
        for (const name of ['c', 'a', 'b'] as const) {
          vi.when(readPackageMock)
            .calledWith(path.join(projectDirectoryPath, 'packages', name))
            .thenResolve(buildMockPackage(name));
        }

        const project = await readProject(projectDirectoryPath);

        expect(Object.keys(project.workspacePackages)).toStrictEqual([
          'c',
          'a',
          'b',
        ]);
      });
    });
  });

  describe('getValidRepositoryUrl', () => {
    describe('if the `npm_package_repository_url` environment variable is set', () => {
      it('returns the HTTPS version of this URL', async () => {
        await withProtectedProcessEnv(async () => {
          process.env.npm_package_repository_url =
            'git@github.com:example-org/example-repo.git';
          const packageManifest = {};
          const repositoryDirectoryPath = '/path/to/project';

          expect(
            await getValidRepositoryUrl(
              packageManifest,
              repositoryDirectoryPath,
            ),
          ).toBe('https://github.com/example-org/example-repo');
        });
      });
    });

    describe('if package.json has a string "repository" field', () => {
      it('returns the HTTPS version of this URL', async () => {
        const packageManifest = {
          repository: 'git@github.com:example-org/example-repo.git',
        };
        const repositoryDirectoryPath = '/path/to/project';

        expect(
          await getValidRepositoryUrl(packageManifest, repositoryDirectoryPath),
        ).toBe('https://github.com/example-org/example-repo');
      });
    });

    describe('if package.json has an object "repository" field with a string "url" field', () => {
      it('returns the HTTPS version of this URL', async () => {
        const packageManifest = {
          repository: {
            url: 'git@github.com:example-org/example-repo.git',
          },
        };
        const repositoryDirectoryPath = '/path/to/project';

        expect(
          await getValidRepositoryUrl(packageManifest, repositoryDirectoryPath),
        ).toBe('https://github.com/example-org/example-repo');
      });
    });

    describe('if package.json does not have a "repository" field', () => {
      it('returns the HTTPS version of this URL', async () => {
        const packageManifest = {};
        const repositoryDirectoryPath = '/path/to/project';
        vi.when(vi.spyOn(miscUtils, 'getStdoutFromCommand'))
          .calledWith('git', ['config', '--get', 'remote.origin.url'], {
            cwd: repositoryDirectoryPath,
          })
          .thenResolve('git@github.com:example-org/example-repo.git');

        expect(
          await getValidRepositoryUrl(packageManifest, repositoryDirectoryPath),
        ).toBe('https://github.com/example-org/example-repo');
      });
    });
  });

  describe('restoreChangelogsForSkippedPackages', () => {
    it('should reset changelog for packages with changes not included in release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a'),
          b: buildMockPackage('b'),
          c: buildMockPackage('c'),
        },
      });

      const restoreFilesSpy = vi.spyOn(repoModule, 'restoreFiles');

      vi.when(vi.spyOn(fs, 'fileExists'))
        .calledWith(project.workspacePackages.b.changelogPath)
        .thenResolve(true);

      vi.when(vi.spyOn(fs, 'fileExists'))
        .calledWith(project.workspacePackages.c.changelogPath)
        .thenResolve(true);

      await restoreChangelogsForSkippedPackages({
        project,
        changedPackageNames: new Set(['a', 'b', 'c']),
        defaultBranch: 'main',
        releaseSpecificationPackages: {
          a: IncrementableVersionParts.minor,
        },
      });

      expect(restoreFilesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'main',
        [
          '/path/to/packages/b/CHANGELOG.md',
          '/path/to/packages/c/CHANGELOG.md',
        ],
      );
    });

    it('should not reset changelog for packages without changes since last release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a'),
          b: buildMockPackage('b'),
        },
      });

      const restoreFilesSpy = vi.spyOn(repoModule, 'restoreFiles');

      await restoreChangelogsForSkippedPackages({
        project,
        changedPackageNames: new Set(['a']),
        defaultBranch: 'main',
        releaseSpecificationPackages: {
          a: IncrementableVersionParts.minor,
        },
      });

      expect(restoreFilesSpy).not.toHaveBeenCalledWith(
        project.directoryPath,
        'main',
        ['/path/to/packages/b/CHANGELOG.md'],
      );
    });

    it('should not reset non-existent changelogs', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a'),
          b: buildMockPackage('b'),
        },
      });

      vi.when(vi.spyOn(fs, 'fileExists'))
        .calledWith(project.workspacePackages.a.changelogPath)
        .thenResolve(false);

      const restoreFilesSpy = vi.spyOn(repoModule, 'restoreFiles');

      await restoreChangelogsForSkippedPackages({
        project,
        changedPackageNames: new Set(['a', 'b']),
        defaultBranch: 'main',
        releaseSpecificationPackages: {
          a: IncrementableVersionParts.minor,
        },
      });

      expect(restoreFilesSpy).not.toHaveBeenCalledWith(
        project.directoryPath,
        'main',
        [project.workspacePackages.b.changelogPath],
      );
    });
  });

  describe('updateChangelogsForChangedPackages', () => {
    it('should update changelog files of all the packages that has changes since latest release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a'),
          b: buildMockPackage('b'),
        },
      });

      const updatePackageChangelogSpy = vi
        .spyOn(packageModule, 'updatePackageChangelog')
        .mockResolvedValue('updated');

      const notices = await updateChangelogsForChangedPackages({
        project,
        changedPackageNames: new Set(['a', 'b']),
        formatter: 'prettier',
      });

      expect(updatePackageChangelogSpy).toHaveBeenCalledWith({
        project,
        package: project.workspacePackages.a,
        formatter: 'prettier',
      });

      expect(updatePackageChangelogSpy).toHaveBeenCalledWith({
        project,
        package: project.workspacePackages.b,
        formatter: 'prettier',
      });
      expect(notices).toStrictEqual([]);
    });

    it('should not update changelog files of all the packages that has not changed since latest release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a'),
        },
      });

      const updatePackageChangelogSpy = vi.spyOn(
        packageModule,
        'updatePackageChangelog',
      );

      await updateChangelogsForChangedPackages({
        project,
        changedPackageNames: new Set(),
        formatter: 'prettier',
      });

      expect(updatePackageChangelogSpy).not.toHaveBeenCalled();
    });

    it('returns the packages without a changelog or without updates as notices', async () => {
      const project = buildMockProject({
        workspacePackages: Object.fromEntries(
          ['a', 'b', 'c', 'd'].map((name) => [name, buildMockPackage(name)]),
        ),
      });
      const results = {
        a: 'no-updates',
        b: 'no-changelog',
        c: 'no-updates',
        d: 'updated',
      } as const;
      vi.spyOn(packageModule, 'updatePackageChangelog').mockImplementation(
        async ({ package: pkg }) =>
          results[pkg.validatedManifest.name as keyof typeof results],
      );

      const notices = await updateChangelogsForChangedPackages({
        project,
        changedPackageNames: new Set(['a', 'b', 'c', 'd']),
        formatter: 'prettier',
      });

      expect(notices).toStrictEqual([
        {
          title: '1 package has no changelog to update:',
          items: ['b'],
        },
        { title: '2 changelogs have no updates to make:', items: ['a', 'c'] },
      ]);
    });
  });

  describe('buildChangelogNotices', () => {
    it('uses plural titles for more than one package', () => {
      expect(
        buildChangelogNotices([
          { name: 'a', result: 'no-changelog' },
          { name: 'b', result: 'no-changelog' },
          { name: 'c', result: 'no-updates' },
        ]),
      ).toStrictEqual([
        {
          title: '2 packages have no changelog to update:',
          items: ['a', 'b'],
        },
        { title: '1 changelog has no updates to make:', items: ['c'] },
      ]);
    });

    it('returns no notices when every changelog was updated', () => {
      expect(
        buildChangelogNotices([{ name: 'a', result: 'updated' }]),
      ).toStrictEqual([]);
    });
  });
});
