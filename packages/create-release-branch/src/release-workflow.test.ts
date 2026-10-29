import fs from 'fs';
import path from 'path';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { withSandbox } from '../tests/helpers.js';
import { buildMockProject } from '../tests/unit/helpers.js';
import * as editorModule from './editor.js';
import { fileExists } from './fs.js';
import * as releaseSpecificationModule from './release-specification.js';
import {
  finishRelease,
  followReleaseWorkflow,
  startRelease,
} from './release-workflow.js';
import type { ReleaseSource } from './release-workflow.js';
import * as repoModule from './repo.js';
import * as workflowOperations from './workflow-operations.js';
import * as yarnCommands from './yarn-commands.js';

vi.mock('./editor');
vi.mock('./release-specification');
vi.mock('./repo');
vi.mock('./workflow-operations');
vi.mock('./yarn-commands.js');

type FakeSpecification = { packages: Record<string, string> };

/**
 * Builds a release source whose methods are all mock functions.
 *
 * @returns The fake release source.
 */
function buildFakeSource(): {
  [Key in Exclude<
    keyof ReleaseSource<FakeSpecification>,
    'allowEmptyInitializeCommit'
  >]: Mock<ReleaseSource<FakeSpecification>[Key]>;
} {
  return {
    prepare: vi.fn().mockResolvedValue(undefined),
    generateReleaseSpecificationTemplate: vi
      .fn()
      .mockResolvedValue('some template'),
    validateReleaseSpecification: vi
      .fn()
      .mockResolvedValue({ packages: { a: 'major' } }),
    apply: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Makes `createReleaseBranch` report the given version and first-run state.
 *
 * @param version - The new release version.
 * @param firstRun - Whether the release branch was just created.
 */
function mockCreateReleaseBranch(version: string, firstRun: boolean): void {
  vi.spyOn(workflowOperations, 'createReleaseBranch').mockResolvedValue({
    version,
    firstRun,
  });
}

describe('release-workflow', () => {
  describe('startRelease', () => {
    it('commits "Initialize Release 2.0.0" after prepare on the first run', async () => {
      const project = buildMockProject();
      const source = buildFakeSource();
      mockCreateReleaseBranch('2.0.0', true);
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');

      const result = await startRelease({
        project,
        releaseType: 'ordinary',
        source,
      });

      expect(result).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(workflowOperations.createReleaseBranch).toHaveBeenCalledWith({
        project,
        releaseType: 'ordinary',
      });
      expect(source.prepare).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 2.0.0',
      );
      expect(source.prepare.mock.invocationCallOrder[0]).toBeLessThan(
        commitAllChangesSpy.mock.invocationCallOrder[0],
      );
    });

    it('allows the "Initialize Release" commit to be empty if the source asks for it', async () => {
      const project = buildMockProject();
      const source = { ...buildFakeSource(), allowEmptyInitializeCommit: true };
      mockCreateReleaseBranch('2.0.0', true);
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');

      await startRelease({ project, releaseType: 'ordinary', source });

      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 2.0.0',
        { allowEmpty: true },
      );
    });

    it('does not prepare or commit when the branch already exists', async () => {
      const project = buildMockProject();
      const source = buildFakeSource();
      mockCreateReleaseBranch('2.0.0', false);
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');

      const result = await startRelease({
        project,
        releaseType: 'ordinary',
        source,
      });

      expect(result).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(source.prepare).not.toHaveBeenCalled();
      expect(commitAllChangesSpy).not.toHaveBeenCalled();
    });
  });

  describe('finishRelease', () => {
    it('runs constraints, install, dedupe, then commits "Update Release 2.0.0"', async () => {
      const project = buildMockProject();
      const fixConstraintsSpy = vi.spyOn(yarnCommands, 'fixConstraints');
      const updateYarnLockfileSpy = vi.spyOn(
        yarnCommands,
        'updateYarnLockfile',
      );
      const deduplicateDependenciesSpy = vi.spyOn(
        yarnCommands,
        'deduplicateDependencies',
      );
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');

      await finishRelease({ project, newReleaseVersion: '2.0.0' });

      expect(fixConstraintsSpy).toHaveBeenCalledWith(project.directoryPath);
      expect(updateYarnLockfileSpy).toHaveBeenCalledWith(project.directoryPath);
      expect(deduplicateDependenciesSpy).toHaveBeenCalledWith(
        project.directoryPath,
      );
      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Update Release 2.0.0',
      );
      const order = [
        fixConstraintsSpy,
        updateYarnLockfileSpy,
        deduplicateDependenciesSpy,
        commitAllChangesSpy,
      ].map((spy) => spy.mock.invocationCallOrder[0]);
      expect(order).toStrictEqual([...order].sort((a, b) => a - b));
    });
  });

  describe('followReleaseWorkflow', () => {
    it('validates then applies the edited spec, removes it, and finishes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const stdout = new MockWritable();
        const editor = { path: '/some/editor', args: [] };
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        mockCreateReleaseBranch('2.0.0', true);
        vi.spyOn(editorModule, 'determineEditor').mockResolvedValue(editor);
        const waitForUserToEditReleaseSpecificationSpy = vi.spyOn(
          releaseSpecificationModule,
          'waitForUserToEditReleaseSpecification',
        );
        const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');
        source.apply.mockImplementation(async () => {
          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });

        await followReleaseWorkflow({
          project,
          tempDirectoryPath: sandbox.directoryPath,
          firstRemovingExistingReleaseSpecification: false,
          releaseType: 'ordinary',
          source,
          stdout,
        });

        expect(
          source.generateReleaseSpecificationTemplate,
        ).toHaveBeenCalledWith({ isEditorAvailable: true });
        expect(waitForUserToEditReleaseSpecificationSpy).toHaveBeenCalledWith(
          releaseSpecificationPath,
          editor,
        );
        expect(source.validateReleaseSpecification).toHaveBeenCalledWith(
          releaseSpecificationPath,
        );
        expect(source.apply).toHaveBeenCalledWith({
          releaseSpecification: { packages: { a: 'major' } },
          newReleaseVersion: '2.0.0',
        });
        expect(
          source.validateReleaseSpecification.mock.invocationCallOrder[0],
        ).toBeLessThan(source.apply.mock.invocationCallOrder[0]);
        expect(await fileExists(releaseSpecificationPath)).toBe(false);
        expect(yarnCommands.fixConstraints).toHaveBeenCalled();
        expect(commitAllChangesSpy).toHaveBeenLastCalledWith(
          project.directoryPath,
          'Update Release 2.0.0',
        );
        expect(stdout.data()).toStrictEqual([]);
      });
    });

    it('returns after printing the template path when no editor is available', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const stdout = new MockWritable();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        mockCreateReleaseBranch('2.0.0', true);
        vi.spyOn(editorModule, 'determineEditor').mockResolvedValue(null);

        await followReleaseWorkflow({
          project,
          tempDirectoryPath: sandbox.directoryPath,
          firstRemovingExistingReleaseSpecification: false,
          releaseType: 'ordinary',
          source,
          stdout,
        });

        expect(
          source.generateReleaseSpecificationTemplate,
        ).toHaveBeenCalledWith({ isEditorAvailable: false });
        expect(
          await fs.promises.readFile(releaseSpecificationPath, 'utf8'),
        ).toBe('some template');
        expect(stdout.data()).toStrictEqual([
          `A template has been generated that specifies this release. Please open the following file in your editor of choice, then re-run this tool:\n\n${releaseSpecificationPath}\n`,
        ]);
        expect(source.validateReleaseSpecification).not.toHaveBeenCalled();
        expect(source.apply).not.toHaveBeenCalled();
        expect(yarnCommands.fixConstraints).not.toHaveBeenCalled();
      });
    });

    it('picks up an existing spec from a previous run without regenerating it', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const stdout = new MockWritable();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'existing spec');
        mockCreateReleaseBranch('2.0.0', false);

        await followReleaseWorkflow({
          project,
          tempDirectoryPath: sandbox.directoryPath,
          firstRemovingExistingReleaseSpecification: false,
          releaseType: 'ordinary',
          source,
          stdout,
        });

        expect(stdout.data()).toStrictEqual([
          'Release spec already exists. Picking back up from previous run.\n',
        ]);
        expect(editorModule.determineEditor).not.toHaveBeenCalled();
        expect(
          source.generateReleaseSpecificationTemplate,
        ).not.toHaveBeenCalled();
        expect(source.validateReleaseSpecification).toHaveBeenCalledWith(
          releaseSpecificationPath,
        );
        expect(await fileExists(releaseSpecificationPath)).toBe(false);
      });
    });

    it('removes the spec and rethrows when editing fails', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const stdout = new MockWritable();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        mockCreateReleaseBranch('2.0.0', true);
        vi.spyOn(editorModule, 'determineEditor').mockResolvedValue({
          path: '/some/editor',
          args: [],
        });
        vi.spyOn(
          releaseSpecificationModule,
          'waitForUserToEditReleaseSpecification',
        ).mockRejectedValue(new Error('oops'));

        await expect(
          followReleaseWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            source,
            stdout,
          }),
        ).rejects.toThrow('oops');

        expect(await fileExists(releaseSpecificationPath)).toBe(false);
        expect(source.validateReleaseSpecification).not.toHaveBeenCalled();
      });
    });

    it('keeps the spec and does not finish the release when validation fails', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'existing spec');
        mockCreateReleaseBranch('2.0.0', false);
        source.validateReleaseSpecification.mockRejectedValue(
          new Error('invalid spec'),
        );

        await expect(
          followReleaseWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            source,
            stdout: new MockWritable(),
          }),
        ).rejects.toThrow('invalid spec');

        expect(await fileExists(releaseSpecificationPath)).toBe(true);
        expect(source.apply).not.toHaveBeenCalled();
        expect(yarnCommands.fixConstraints).not.toHaveBeenCalled();
        expect(yarnCommands.updateYarnLockfile).not.toHaveBeenCalled();
        expect(yarnCommands.deduplicateDependencies).not.toHaveBeenCalled();
        expect(repoModule.commitAllChanges).not.toHaveBeenCalled();
      });
    });

    it('keeps the spec and does not finish the release when applying fails', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const source = buildFakeSource();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'RELEASE_SPEC.yml',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'existing spec');
        mockCreateReleaseBranch('2.0.0', false);
        source.apply.mockRejectedValue(new Error('apply failed'));

        await expect(
          followReleaseWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            source,
            stdout: new MockWritable(),
          }),
        ).rejects.toThrow('apply failed');

        expect(await fileExists(releaseSpecificationPath)).toBe(true);
        expect(yarnCommands.fixConstraints).not.toHaveBeenCalled();
        expect(yarnCommands.updateYarnLockfile).not.toHaveBeenCalled();
        expect(yarnCommands.deduplicateDependencies).not.toHaveBeenCalled();
        expect(repoModule.commitAllChanges).not.toHaveBeenCalled();
      });
    });
  });
});
