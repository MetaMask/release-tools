import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../tests/unit/helpers.js';
import { createLegacyReleaseSource } from './legacy-release-source.js';
import * as projectModule from './project.js';
import * as releasePlanModule from './release-plan.js';
import type { ReleasePlan } from './release-plan.js';
import { IncrementableVersionParts } from './release-specification.js';
import * as releaseSpecificationModule from './release-specification.js';
import type { ReleaseSpecification } from './release-specification.js';

vi.mock('./project');
vi.mock('./release-plan');
vi.mock('./release-specification');

/**
 * Builds a legacy release source with mock arguments.
 *
 * @returns The source and the arguments it was created with.
 */
function setupSource(): {
  source: ReturnType<typeof createLegacyReleaseSource>;
  project: ReturnType<typeof buildMockProject>;
  stderr: MockWritable;
} {
  const project = buildMockProject();
  const stderr = new MockWritable();
  const source = createLegacyReleaseSource({
    project,
    defaultBranch: 'main',
    formatter: 'prettier',
    stderr,
  });
  return { source, project, stderr };
}

describe('legacy-release-source', () => {
  describe('createLegacyReleaseSource', () => {
    describe('prepare', () => {
      it('updates the changelogs of the changed packages', async () => {
        const { source, project, stderr } = setupSource();

        await source.prepare();

        expect(
          projectModule.updateChangelogsForChangedPackages,
        ).toHaveBeenCalledWith({ project, formatter: 'prettier', stderr });
      });
    });

    describe('generateReleaseSpecificationTemplate', () => {
      it('generates the monorepo release spec template', async () => {
        const { source, project } = setupSource();
        vi.mocked(
          releaseSpecificationModule.generateReleaseSpecificationTemplateForMonorepo,
        ).mockResolvedValue('some template');

        const template = await source.generateReleaseSpecificationTemplate({
          isEditorAvailable: true,
        });

        expect(template).toBe('some template');
        expect(
          releaseSpecificationModule.generateReleaseSpecificationTemplateForMonorepo,
        ).toHaveBeenCalledWith({ project, isEditorAvailable: true });
      });
    });

    describe('validateReleaseSpecification', () => {
      it('validates the release spec at the given path', async () => {
        const { source, project } = setupSource();
        const releaseSpecification: ReleaseSpecification = {
          packages: { a: IncrementableVersionParts.major },
          path: '/path/to/RELEASE_SPEC.yml',
        };
        vi.mocked(
          releaseSpecificationModule.validateReleaseSpecification,
        ).mockResolvedValue(releaseSpecification);

        const result = await source.validateReleaseSpecification(
          '/path/to/RELEASE_SPEC.yml',
        );

        expect(result).toBe(releaseSpecification);
        expect(
          releaseSpecificationModule.validateReleaseSpecification,
        ).toHaveBeenCalledWith(project, '/path/to/RELEASE_SPEC.yml');
      });
    });

    describe('apply', () => {
      it('restores skipped changelogs, then plans and executes the release', async () => {
        const { source, project, stderr } = setupSource();
        const packages: ReleaseSpecification['packages'] = {
          a: IncrementableVersionParts.major,
        };
        const releasePlan: ReleasePlan = { newVersion: '2.0.0', packages: [] };
        const calls: string[] = [];
        vi.mocked(
          projectModule.restoreChangelogsForSkippedPackages,
        ).mockImplementation(async () => {
          calls.push('restoreChangelogsForSkippedPackages');
        });
        vi.mocked(releasePlanModule.planRelease).mockImplementation(
          async () => {
            calls.push('planRelease');
            return releasePlan;
          },
        );
        vi.mocked(releasePlanModule.executeReleasePlan).mockImplementation(
          async () => {
            calls.push('executeReleasePlan');
          },
        );

        await source.apply({
          releaseSpecification: { packages, path: '/path/to/RELEASE_SPEC.yml' },
          newReleaseVersion: '2.0.0',
        });

        expect(calls).toStrictEqual([
          'restoreChangelogsForSkippedPackages',
          'planRelease',
          'executeReleasePlan',
        ]);
        expect(
          projectModule.restoreChangelogsForSkippedPackages,
        ).toHaveBeenCalledWith({
          project,
          releaseSpecificationPackages: packages,
          defaultBranch: 'main',
        });
        expect(releasePlanModule.planRelease).toHaveBeenCalledWith({
          project,
          releaseSpecificationPackages: packages,
          newReleaseVersion: '2.0.0',
        });
        expect(releasePlanModule.executeReleasePlan).toHaveBeenCalledWith(
          project,
          releasePlan,
          'prettier',
          stderr,
        );
      });
    });
  });
});
