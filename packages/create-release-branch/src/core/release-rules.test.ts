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
import type { ReleaseChoices } from './release-rules.js';

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
            packageName: 'a',
            problem:
              'has a major bump, but its direct dependents are not in the release spec: b',
            hint: 'Add them to the release spec, or set them to intentionally-skip.',
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
          packageName: 'a',
          entryIndex: 0,
          problem: '"asdf" is not a valid version specifier',
          hint: 'Use major, minor, patch, or a version like 1.2.3.',
        },
        {
          packageName: 'b',
          entryIndex: 1,
          problem: 'is not a package in the project',
          hint: 'Check the name, or remove the line.',
        },
      ]);
    });

    it.each([
      {
        rule: 'an unknown package',
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
        choices: { b: 'minor' },
        error: {
          packageName: 'b',
          entryIndex: 0,
          problem: 'is not a package in the project',
          hint: 'Check the name, or remove the line.',
        },
      },
      {
        rule: 'an invalid version specifier',
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
        choices: { a: 'asdf' },
        error: {
          packageName: 'a',
          entryIndex: 0,
          problem: '"asdf" is not a valid version specifier',
          hint: 'Use major, minor, patch, or a version like 1.2.3.',
        },
      },
      {
        rule: 'a version specifier that is not a string',
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
        choices: { a: { version: '2.0.0' } } as unknown as ReleaseChoices,
        error: {
          packageName: 'a',
          entryIndex: 0,
          problem: '"{"version":"2.0.0"}" is not a valid version specifier',
          hint: 'Use major, minor, patch, or a version like 1.2.3.',
        },
      },
      {
        rule: 'the current version',
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
        choices: { a: '1.0.0' },
        error: {
          packageName: 'a',
          entryIndex: 0,
          problem: 'is already at version 1.0.0',
          hint: 'Use a higher version, or major, minor, or patch.',
        },
      },
      {
        rule: 'a lower version',
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
        choices: { a: '0.9.0' },
        error: {
          packageName: 'a',
          entryIndex: 0,
          problem: '"0.9.0" is lower than the current version 1.0.0',
          hint: 'Use a higher version, or major, minor, or patch.',
        },
      },
      {
        rule: 'missing direct dependents',
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', {
            validatedManifest: { dependencies: { a: '1.0.0' } },
          }),
          c: buildMockPackage('c', {
            validatedManifest: { dependencies: { a: '1.0.0' } },
          }),
        },
        choices: { a: 'major' },
        error: {
          packageName: 'a',
          problem:
            'has a major bump, but its direct dependents are not in the release spec: b, c',
          hint: 'Add them to the release spec, or set them to intentionally-skip.',
        },
      },
      {
        rule: 'missing peer dependents',
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0'),
          b: buildMockPackage('b', {
            validatedManifest: { peerDependencies: { a: '1.0.0' } },
          }),
          c: buildMockPackage('c', {
            validatedManifest: { peerDependencies: { a: '1.0.0' } },
          }),
        },
        choices: { a: 'major' },
        error: {
          packageName: 'a',
          problem:
            'has a major bump, but its peer dependents are not in the release spec: b, c',
          hint: 'Add them so they stay compatible, or set them to intentionally-skip if they can wait.',
        },
      },
      {
        rule: 'missing changed dependencies',
        workspacePackages: {
          a: buildMockPackage('a', {
            validatedManifest: {
              dependencies: { b: '1.0.0' },
              peerDependencies: { c: '1.0.0' },
            },
          }),
          b: buildMockPackage('b', { hasChangesSinceLatestRelease: true }),
          c: buildMockPackage('c', { hasChangesSinceLatestRelease: true }),
        },
        choices: { a: 'minor' },
        error: {
          packageName: 'a',
          problem:
            'depends on packages with unreleased changes that are not in the release spec: b, c',
          hint: 'Add them to the release spec, or set them to intentionally-skip if they can wait.',
        },
      },
    ])(
      'reports $rule with its problem and hint',
      ({ workspacePackages, choices, error }) => {
        const project = buildMockProject({ workspacePackages });

        expect(checkReleaseChoices(project, choices).errors).toStrictEqual([
          error,
        ]);
      },
    );
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
