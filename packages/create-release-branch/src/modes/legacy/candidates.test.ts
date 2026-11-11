import { describe, expect, it } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import { listLegacyCandidates } from './candidates.js';

describe('legacy candidates', () => {
  describe('listLegacyCandidates', () => {
    it('lists changed packages in workspace order', () => {
      const project = buildMockProject({
        workspacePackages: {
          c: buildMockPackage('c', '3.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          a: buildMockPackage('a', '1.0.0', {
            hasChangesSinceLatestRelease: false,
          }),
          b: buildMockPackage('b', '2.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
        },
      });

      expect(listLegacyCandidates(project)).toStrictEqual([
        { name: 'c', currentVersion: '3.0.0', kind: 'changes' },
        { name: 'b', currentVersion: '2.0.0', kind: 'changes' },
      ]);
    });

    it('adds direct and peer dependents of major choices once', () => {
      const project = buildMockProject({
        workspacePackages: {
          d: buildMockPackage('d', '4.0.0', {
            validatedManifest: {
              dependencies: { a: '^1.0.0' },
              peerDependencies: { a: '^1.0.0', b: '^1.0.0' },
            },
          }),
          a: buildMockPackage('a', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          c: buildMockPackage('c', '3.0.0', {
            hasChangesSinceLatestRelease: true,
            validatedManifest: {
              dependencies: { a: '^1.0.0' },
            },
          }),
          e: buildMockPackage('e', '5.0.0', {
            validatedManifest: {
              peerDependencies: { b: '^1.0.0' },
            },
          }),
          f: buildMockPackage('f', '6.0.0'),
        },
      });

      expect(
        listLegacyCandidates(project, { a: 'major', b: 'major' }),
      ).toStrictEqual([
        { name: 'd', currentVersion: '4.0.0', kind: 'dependency' },
        { name: 'a', currentVersion: '1.0.0', kind: 'changes' },
        { name: 'b', currentVersion: '1.0.0', kind: 'changes' },
        { name: 'c', currentVersion: '3.0.0', kind: 'changes' },
        { name: 'e', currentVersion: '5.0.0', kind: 'dependency' },
      ]);
    });

    it('ignores non-major choices', () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', '1.0.0', {
            validatedManifest: {
              dependencies: { a: '^1.0.0' },
            },
          }),
          c: buildMockPackage('c', '1.0.0', {
            validatedManifest: {
              peerDependencies: { a: '^1.0.0' },
            },
          }),
        },
      });

      expect(
        listLegacyCandidates(project, { a: 'minor', b: 'intentionally-skip' }),
      ).toStrictEqual([
        { name: 'a', currentVersion: '1.0.0', kind: 'changes' },
      ]);
    });
  });
});
