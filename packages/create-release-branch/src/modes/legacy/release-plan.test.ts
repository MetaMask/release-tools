import { SemVer } from 'semver';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockProject,
  buildMockPackage,
} from '../../../tests/unit/helpers.js';
import { IncrementableVersionParts } from '../../core/release-rules.js';
import * as packageUtils from '../../project/package.js';
import { planRelease, executeReleasePlan } from './release-plan.js';

vi.mock('../../project/package');

describe('release-plan-utils', () => {
  describe('planRelease', () => {
    it('calculates final versions for all packages in the release spec, including bumping the ordinary part of the root package if this is an ordinary release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root', '1.0.0'),
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
          c: buildMockPackage('c', '1.0.0'),
          d: buildMockPackage('d', '1.0.0'),
        },
      });
      const releaseSpecification = {
        packages: {
          a: IncrementableVersionParts.major,
          b: IncrementableVersionParts.minor,
          c: IncrementableVersionParts.patch,
          d: new SemVer('1.2.3'),
        },
        path: '/path/to/release/spec',
      };
      const newReleaseVersion = '2.0.0';
      const releasePlan = await planRelease({
        project,
        releaseSpecificationPackages: releaseSpecification.packages,
        newReleaseVersion,
      });

      expect(releasePlan).toMatchObject({
        newVersion: newReleaseVersion,
        packages: [
          {
            package: project.rootPackage,
            newVersion: '2.0.0',
          },
          {
            package: project.workspacePackages.a,
            newVersion: '2.0.0',
          },
          {
            package: project.workspacePackages.b,
            newVersion: '1.1.0',
          },
          {
            package: project.workspacePackages.c,
            newVersion: '1.0.1',
          },
          {
            package: project.workspacePackages.d,
            newVersion: '1.2.3',
          },
        ],
      });
    });

    it('calculates final versions for all packages in the release spec, including bumping the backport part of the root package if this is a backport release', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root', '1.0.0'),
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
          c: buildMockPackage('c', '1.0.0'),
          d: buildMockPackage('d', '1.0.0'),
        },
      });
      const releaseSpecification = {
        packages: {
          a: IncrementableVersionParts.major,
          b: IncrementableVersionParts.minor,
          c: IncrementableVersionParts.patch,
          d: new SemVer('1.2.3'),
        },
        path: '/path/to/release/spec',
      };
      const newReleaseVersion = '1.1.0';
      const releasePlan = await planRelease({
        project,
        releaseSpecificationPackages: releaseSpecification.packages,
        newReleaseVersion,
      });

      expect(releasePlan).toMatchObject({
        newVersion: newReleaseVersion,
        packages: [
          {
            package: project.rootPackage,
            newVersion: '1.1.0',
          },
          {
            package: project.workspacePackages.a,
            newVersion: '2.0.0',
          },
          {
            package: project.workspacePackages.b,
            newVersion: '1.1.0',
          },
          {
            package: project.workspacePackages.c,
            newVersion: '1.0.1',
          },
          {
            package: project.workspacePackages.d,
            newVersion: '1.2.3',
          },
        ],
      });
    });

    it('records that the changelog for the root package does not need to be updated, while those for the workspace packages do', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('root'),
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
          c: buildMockPackage('c', '1.0.0'),
          d: buildMockPackage('d', '1.0.0'),
        },
      });
      const releaseSpecification = {
        packages: {
          a: new SemVer('2.0.0'),
          b: new SemVer('2.0.0'),
          c: new SemVer('2.0.0'),
          d: new SemVer('2.0.0'),
        },
        path: '/path/to/release/spec',
      };
      const releasePlan = await planRelease({
        project,
        releaseSpecificationPackages: releaseSpecification.packages,
        newReleaseVersion: '2.0.0',
      });

      expect(releasePlan).toMatchObject({
        packages: [
          {
            package: project.rootPackage,
          },
          {
            package: project.workspacePackages.a,
          },
          {
            package: project.workspacePackages.b,
          },
          {
            package: project.workspacePackages.c,
          },
          {
            package: project.workspacePackages.d,
          },
        ],
      });
    });
  });

  describe('executeReleasePlan', () => {
    it('runs updatePackage for each package in the release plan', async () => {
      const project = buildMockProject();
      const releasePlan = {
        newVersion: '1.0.0',
        packages: [
          {
            package: buildMockPackage(),
            newVersion: '1.2.3',
          },
          {
            package: buildMockPackage(),
            newVersion: '1.2.3',
          },
        ],
      };
      const updatePackageSpy = vi.spyOn(packageUtils, 'updatePackage');

      await executeReleasePlan(project, releasePlan, 'prettier');

      expect(updatePackageSpy).toHaveBeenNthCalledWith(1, {
        project,
        packageReleasePlan: releasePlan.packages[0],
        formatter: 'prettier',
      });
      expect(updatePackageSpy).toHaveBeenNthCalledWith(2, {
        project,
        packageReleasePlan: releasePlan.packages[1],
        formatter: 'prettier',
      });
    });

    it('returns the packages without a changelog as a notice', async () => {
      const releasePlan = {
        newVersion: '2.0.0',
        packages: ['a', 'b', 'c'].map((name) => ({
          package: buildMockPackage(name),
          newVersion: '2.0.0',
        })),
      };
      const results = {
        a: 'no-changelog',
        b: 'updated',
        c: 'no-changelog',
      } as const;
      vi.spyOn(packageUtils, 'updatePackage').mockImplementation(
        async ({ packageReleasePlan }) =>
          results[
            packageReleasePlan.package.validatedManifest
              .name as keyof typeof results
          ],
      );

      const notices = await executeReleasePlan(
        buildMockProject(),
        releasePlan,
        'prettier',
      );

      expect(notices).toStrictEqual([
        {
          title: '2 packages have no changelog to update:',
          items: ['a', 'c'],
        },
      ]);
    });

    it('does not list the root package as having no changelog', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
      });
      const releasePlan = {
        newVersion: '2.0.0',
        packages: [project.rootPackage, buildMockPackage('a')].map((pkg) => ({
          package: pkg,
          newVersion: '2.0.0',
        })),
      };
      vi.spyOn(packageUtils, 'updatePackage').mockResolvedValue('no-changelog');

      const notices = await executeReleasePlan(
        project,
        releasePlan,
        'prettier',
      );

      expect(notices).toStrictEqual([
        {
          title: '1 package has no changelog to update:',
          items: ['a'],
        },
      ]);
    });
  });
});
