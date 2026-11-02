import { SemVer } from 'semver';
import { describe, expect, it } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../tests/unit/helpers.js';
import {
  checkReleaseChoices,
  IncrementableVersionParts,
  normalizeReleaseChoices,
} from './release-rules.js';

describe('release-rules', () => {
  describe('checkReleaseChoices', () => {
    it('returns no errors and no findings for valid choices', () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', '1.0.0'),
          c: buildMockPackage('c', '1.0.0'),
          d: buildMockPackage('d', '1.0.0'),
        },
      });

      expect(
        checkReleaseChoices(project, {
          a: 'major',
          b: '2.0.0',
          c: 'intentionally-skip',
          d: null,
        }),
      ).toStrictEqual({ errors: [], dependencyFindings: {} });
    });

    it('reports a missing direct dependent of a major bump as a finding and an error', () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', {
            validatedManifest: {
              dependencies: {
                a: '1.0.0',
              },
            },
          }),
        },
      });

      expect(checkReleaseChoices(project, { a: 'major' })).toStrictEqual({
        errors: [
          {
            message: `
The following direct dependents of package 'a', which is being released with a major version bump, are missing from the release spec.

  - b

  Consider including them in the release spec so that the dependency tree of consuming projects can be kept small.

  If you do not want to do this, then list it with a directive of "intentionally-skip". For example:

    packages:
      b: intentionally-skip
`.trim(),
            packageName: 'a',
          },
        ],
        dependencyFindings: {
          a: {
            missingDirectDependentNames: ['b'],
            missingPeerDependentNames: [],
            missingDependencies: [],
          },
        },
      });
    });

    it('uses packagesWithChanges for missing dependencies', () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', {
            validatedManifest: {
              dependencies: {
                b: '1.0.0',
              },
            },
          }),
          b: buildMockPackage('b', {
            hasChangesSinceLatestRelease: true,
          }),
        },
      });

      expect(
        checkReleaseChoices(
          project,
          { a: 'minor' },
          { packagesWithChanges: new Set() },
        ),
      ).toStrictEqual({ errors: [], dependencyFindings: {} });
      expect(
        checkReleaseChoices(
          project,
          { a: 'minor' },
          { packagesWithChanges: new Set(['b']) },
        ).dependencyFindings,
      ).toStrictEqual({
        a: {
          missingDirectDependentNames: [],
          missingPeerDependentNames: [],
          missingDependencies: ['b'],
        },
      });
    });

    it('sets entryIndex for unknown packages and invalid specifiers', () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
        },
      });

      expect(
        checkReleaseChoices(project, { a: 'asdf', b: 'minor' }).errors,
      ).toStrictEqual([
        {
          message: [
            '"asdf" is not a valid version specifier for package "a"',
            '(must be "major", "minor", or "patch"; or a version string with major, minor, and patch parts, such as "1.2.3")',
          ],
          packageName: 'a',
          entryIndex: 0,
        },
        {
          message: '"b" is not a package in the project',
          packageName: 'b',
          entryIndex: 1,
        },
      ]);
    });
  });

  describe('normalizeReleaseChoices', () => {
    it('normalizeReleaseChoices drops null and intentionally-skip and parses exact versions', () => {
      expect(
        normalizeReleaseChoices({
          a: 'major',
          b: null,
          c: 'intentionally-skip',
          d: '1.2.3',
        }),
      ).toStrictEqual({
        a: IncrementableVersionParts.major,
        d: new SemVer('1.2.3'),
      });
    });
  });
});
