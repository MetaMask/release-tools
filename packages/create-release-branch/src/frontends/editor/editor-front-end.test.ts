import fs from 'fs';
import path from 'path';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  withSandbox,
  Sandbox,
  isErrorWithCode,
} from '../../../tests/helpers.js';
import {
  buildMockProject,
  Require,
  writtenText,
} from '../../../tests/unit/helpers.js';
import { createCliOutput } from '../../core/cli-output.js';
import type { CliOutput } from '../../core/cli-output.js';
import * as releaseBranchModule from '../../core/release-branch.js';
import * as repoModule from '../../core/repo.js';
import type {
  Formatter,
  ReleaseType,
  VersionSpecifiers,
} from '../../core/types.js';
import * as yarnCommands from '../../core/yarn-commands.js';
import { createLegacyMode } from '../../modes/legacy/legacy-mode.js';
import * as releasePlanModule from '../../modes/legacy/release-plan.js';
import type { ReleasePlan } from '../../modes/legacy/release-plan.js';
import type { Project } from '../../project/project.js';
import { createEditorFrontEnd } from './editor-front-end.js';
import * as editorModule from './editor.js';
import type { Editor } from './editor.js';
import * as releaseSpecificationModule from './release-specification.js';

vi.mock('./editor');
vi.mock('../../modes/legacy/release-plan');
vi.mock('./release-specification');
vi.mock('../../core/repo');
vi.mock('../../core/yarn-commands.js');

/**
 * Runs the editor front end with the legacy mode, the way `main` does.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.tempDirectoryPath - A directory in which to hold the generated
 * release spec file.
 * @param args.firstRemovingExistingReleaseSpecification - Whether to replace a
 * release spec that a previous run left behind.
 * @param args.releaseType - The type of release.
 * @param args.defaultBranch - The name of the default branch in the repository.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @param args.output - Where to write user-facing messages.
 */
async function followMonorepoWorkflow({
  project,
  tempDirectoryPath,
  firstRemovingExistingReleaseSpecification,
  releaseType,
  defaultBranch,
  formatter,
  output,
}: {
  project: Project;
  tempDirectoryPath: string;
  firstRemovingExistingReleaseSpecification: boolean;
  releaseType: ReleaseType;
  defaultBranch: string;
  formatter: Formatter;
  output: CliOutput;
}): Promise<void> {
  const mode = createLegacyMode({ project, defaultBranch, formatter, output });
  await createEditorFrontEnd({
    tempDirectoryPath,
    reset: firstRemovingExistingReleaseSpecification,
  }).run({ project, mode, releaseType, output });
}

/**
 * Tests the given path to determine whether it represents a file.
 *
 * @param entryPath - The path to a file (or directory) on the filesystem.
 * @returns A promise for true if the file exists or false otherwise.
 */
async function fileExists(entryPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(entryPath);
    return stats.isFile();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

/**
 * Mocks the dependencies for `followMonorepoWorkflow`.
 *
 * @returns The corresponding mock functions for each of the dependencies.
 */
function getDependencySpies(): {
  determineEditorSpy: Mock<typeof editorModule.determineEditor>;
  determineReleaseVersionSpy: Mock<
    typeof releaseBranchModule.determineReleaseVersion
  >;
  ensureReleaseBranchSpy: Mock<typeof releaseBranchModule.ensureReleaseBranch>;
  generateReleaseSpecificationTemplateForMonorepoSpy: Mock<
    typeof releaseSpecificationModule.generateReleaseSpecificationTemplateForMonorepo
  >;
  waitForUserToEditReleaseSpecificationSpy: Mock<
    typeof releaseSpecificationModule.waitForUserToEditReleaseSpecification
  >;
  validateReleaseSpecificationSpy: Mock<
    typeof releaseSpecificationModule.validateReleaseSpecification
  >;
  planReleaseSpy: Mock<typeof releasePlanModule.planRelease>;
  executeReleasePlanSpy: Mock<typeof releasePlanModule.executeReleasePlan>;
  commitAllChangesSpy: Mock<typeof repoModule.commitAllChanges>;
  fixConstraintsSpy: Mock<typeof yarnCommands.fixConstraints>;
  updateYarnLockfileSpy: Mock<typeof yarnCommands.updateYarnLockfile>;
  deduplicateDependenciesSpy: Mock<typeof yarnCommands.deduplicateDependencies>;
} {
  return {
    determineEditorSpy: vi.spyOn(editorModule, 'determineEditor'),
    determineReleaseVersionSpy: vi.spyOn(
      releaseBranchModule,
      'determineReleaseVersion',
    ),
    ensureReleaseBranchSpy: vi.spyOn(
      releaseBranchModule,
      'ensureReleaseBranch',
    ),
    generateReleaseSpecificationTemplateForMonorepoSpy: vi.spyOn(
      releaseSpecificationModule,
      'generateReleaseSpecificationTemplateForMonorepo',
    ),
    waitForUserToEditReleaseSpecificationSpy: vi.spyOn(
      releaseSpecificationModule,
      'waitForUserToEditReleaseSpecification',
    ),
    validateReleaseSpecificationSpy: vi.spyOn(
      releaseSpecificationModule,
      'validateReleaseSpecification',
    ),
    planReleaseSpy: vi.spyOn(releasePlanModule, 'planRelease'),
    executeReleasePlanSpy: vi.spyOn(releasePlanModule, 'executeReleasePlan'),
    commitAllChangesSpy: vi.spyOn(repoModule, 'commitAllChanges'),
    fixConstraintsSpy: vi.spyOn(yarnCommands, 'fixConstraints'),
    updateYarnLockfileSpy: vi.spyOn(yarnCommands, 'updateYarnLockfile'),
    deduplicateDependenciesSpy: vi.spyOn(
      yarnCommands,
      'deduplicateDependencies',
    ),
  };
}

type ReleaseSpecification = {
  packages: VersionSpecifiers;
  path: string;
};

/**
 * Builds a release specification object for use in tests. All properties have
 * default values, so you can specify only the properties you care about.
 *
 * @param overrides - The properties you want to override in the mock release
 * specification.
 * @param overrides.packages - A mapping of package names to version specifiers.
 * @param overrides.path - The path to the original release specification file.
 * @returns The mock release specification.
 */
function buildMockReleaseSpecification({
  packages = {},
  path: releaseSpecificationPath,
}: Require<Partial<ReleaseSpecification>, 'path'>): ReleaseSpecification {
  return { packages, path: releaseSpecificationPath };
}

/**
 * Builds a release plan object for use in tests. All properties have
 * default values, so you can specify only the properties you care about.
 *
 * @param overrides - The properties you want to override in the mock release
 * plan.
 * @param overrides.newVersion - The new version that should be released,
 * encompassing one or more updates to packages within the project. This is
 * always a SemVer-compatible string, though the meaning of each number depends
 * on the type of project. For a polyrepo package or a monorepo with fixed
 * versions, the format of the version string is "MAJOR.MINOR.PATCH"; for a
 * monorepo with independent versions, it is "ORDINARY.BACKPORT.0", where
 * `BACKPORT` is used to name a release that sits between two ordinary releases,
 * and `ORDINARY` is used to name any other (non-backport) release.
 * @param overrides.packages - Describes how the packages in the project should
 * be updated. For a polyrepo package, this list will only contain the package
 * itself; for a monorepo package it will consist of the root package and any
 * workspace packages that will be included in the release.
 * @returns The mock release specification.
 */
function buildMockReleasePlan({
  newVersion = '1.0.0',
  packages = [],
}: Partial<ReleasePlan> = {}): ReleasePlan {
  return { newVersion, packages };
}

/**
 * Builds an editor object for use in tests. All properties have default values,
 * so you can specify only the properties you care about.
 *
 * @param overrides - The properties you want to override in the mock editor.
 * @param overrides.path - The path to the executable representing the editor.
 * @param overrides.args - Command-line arguments to pass to the executable when
 * calling it.
 * @returns The mock editor.
 */
function buildMockEditor({
  path: editorPath = '/some/editor',
  args = [],
}: Partial<Editor> = {}): Editor {
  return { path: editorPath, args };
}

/**
 * Sets up an invocation of `followMonorepoWorkflow` so that a particular
 * branch of logic within its implementation will be followed.
 *
 * @param args - The arguments.
 * @param args.sandbox - The sandbox.
 * @param args.doesReleaseSpecFileExist - Whether the release spec file should
 * be created.
 * @param args.isEditorAvailable - Whether `determineEditor` should return an
 * editor object.
 * @param args.errorUponEditingReleaseSpec - The error that
 * `waitForUserToEditReleaseSpecification` will throw.
 * @param args.errorUponValidatingReleaseSpec - The error that
 * `validateReleaseSpecification` will throw.
 * @param args.errorUponPlanningRelease - The error that `planRelease` will
 * throw.
 * @param args.errorUponExecutingReleasePlan - The error that
 * `executeReleasePlan` will throw.
 * @param args.releaseVersion - The new version that the release plan will
 * contain.
 * @param args.formatter - The formatter that will be passed to
 * `executeReleasePlan`.
 * @returns Mock functions and other data that can be used in tests to make
 * assertions.
 */
async function setupFollowMonorepoWorkflow({
  sandbox,
  doesReleaseSpecFileExist,
  isEditorAvailable = false,
  errorUponEditingReleaseSpec,
  errorUponValidatingReleaseSpec,
  errorUponPlanningRelease,
  errorUponExecutingReleasePlan,
  releaseVersion = '1.0.0',
  formatter = 'prettier',
}: {
  sandbox: Sandbox;
  doesReleaseSpecFileExist: boolean;
  isEditorAvailable?: boolean;
  errorUponEditingReleaseSpec?: Error;
  errorUponValidatingReleaseSpec?: Error;
  errorUponPlanningRelease?: Error;
  errorUponExecutingReleasePlan?: Error;
  releaseVersion?: string;
  formatter?: Formatter;
}): Promise<
  Omit<
    ReturnType<typeof getDependencySpies>,
    'determineEditorSpy' | 'validateReleaseSpecificationSpy'
  > & {
    project: Project;
    projectDirectoryPath: string;
    formatter: Formatter;
    stdout: MockWritable;
    output: CliOutput;
    releaseSpecification: ReleaseSpecification;
    releasePlan: ReleasePlan;
    releaseVersion: string;
    releaseSpecificationPath: string;
  }
> {
  const {
    determineEditorSpy,
    determineReleaseVersionSpy,
    ensureReleaseBranchSpy,
    generateReleaseSpecificationTemplateForMonorepoSpy,
    waitForUserToEditReleaseSpecificationSpy,
    validateReleaseSpecificationSpy,
    planReleaseSpy,
    executeReleasePlanSpy,
    commitAllChangesSpy,
    fixConstraintsSpy,
    updateYarnLockfileSpy,
    deduplicateDependenciesSpy,
  } = getDependencySpies();
  const editor = buildMockEditor();
  const releaseSpecificationPath = path.join(
    sandbox.directoryPath,
    'RELEASE_SPEC.yml',
  );
  const releaseSpecification = buildMockReleaseSpecification({
    path: releaseSpecificationPath,
  });
  const releasePlan = buildMockReleasePlan({ newVersion: releaseVersion });
  const projectDirectoryPath = '/path/to/project';
  const project = buildMockProject({ directoryPath: projectDirectoryPath });
  const stdout = new MockWritable();
  const output = createCliOutput({ stdout, stderr: new MockWritable() });
  determineEditorSpy.mockResolvedValue(isEditorAvailable ? editor : null);
  vi.when(generateReleaseSpecificationTemplateForMonorepoSpy)
    .calledWith({ modeName: 'legacy', candidates: [], isEditorAvailable })
    .thenResolve('');

  if (errorUponEditingReleaseSpec) {
    vi.when(waitForUserToEditReleaseSpecificationSpy)
      .calledWith(releaseSpecificationPath, editor)
      .thenReject(errorUponEditingReleaseSpec);
  } else {
    vi.when(waitForUserToEditReleaseSpecificationSpy)
      .calledWith(releaseSpecificationPath, editor)
      .thenResolve();
  }

  const validateReleaseSpecificationStub = vi
    .when(validateReleaseSpecificationSpy)
    .calledWith(
      releaseSpecificationPath,
      expect.any(Function) as Parameters<
        typeof releaseSpecificationModule.validateReleaseSpecification
      >[1],
    );

  if (errorUponValidatingReleaseSpec) {
    validateReleaseSpecificationStub.thenReject(errorUponValidatingReleaseSpec);
  } else {
    validateReleaseSpecificationStub.thenResolve({
      releases: [],
      data: releaseSpecification.packages,
    });
  }

  if (errorUponPlanningRelease) {
    vi.when(planReleaseSpy)
      .calledWith({
        project,
        releaseSpecificationPackages: releaseSpecification.packages,
        newReleaseVersion: releaseVersion,
      })
      .thenReject(errorUponPlanningRelease);
  } else {
    vi.when(planReleaseSpy)
      .calledWith({
        project,
        releaseSpecificationPackages: releaseSpecification.packages,
        newReleaseVersion: releaseVersion,
      })
      .thenResolve(releasePlan);
  }

  if (errorUponExecutingReleasePlan) {
    vi.when(executeReleasePlanSpy)
      .calledWith(project, releasePlan, formatter, output)
      .thenReject(errorUponExecutingReleasePlan);
  } else {
    vi.when(executeReleasePlanSpy)
      .calledWith(project, releasePlan, formatter, output)
      .thenResolve(undefined);
  }

  vi.when(commitAllChangesSpy)
    .calledWith(projectDirectoryPath, '')
    .thenResolve();

  if (doesReleaseSpecFileExist) {
    await fs.promises.writeFile(
      releaseSpecificationPath,
      'some release specification',
    );
  }

  return {
    project,
    projectDirectoryPath,
    formatter,
    stdout,
    output,
    generateReleaseSpecificationTemplateForMonorepoSpy,
    waitForUserToEditReleaseSpecificationSpy,
    releaseSpecification,
    planReleaseSpy,
    executeReleasePlanSpy,
    commitAllChangesSpy,
    determineReleaseVersionSpy,
    ensureReleaseBranchSpy,
    releasePlan,
    releaseVersion,
    releaseSpecificationPath,
    fixConstraintsSpy,
    updateYarnLockfileSpy,
    deduplicateDependenciesSpy,
  };
}

describe('editor-front-end', () => {
  describe('createEditorFrontEnd', () => {
    describe('when firstRemovingExistingReleaseSpecification is false, the release spec file does not already exist, and an editor is available', () => {
      it('should determine the release version and ensure its branch if given releaseType: "ordinary"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            determineReleaseVersionSpy,
            ensureReleaseBranchSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(determineReleaseVersionSpy).toHaveBeenCalledWith(
            project,
            'ordinary',
          );
          expect(ensureReleaseBranchSpy).toHaveBeenCalledWith(project, '2.0.0');
        });
      });

      it('should determine the release version and ensure its branch if given releaseType: "backport"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            determineReleaseVersionSpy,
            ensureReleaseBranchSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'backport',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(determineReleaseVersionSpy).toHaveBeenCalledWith(
            project,
            'backport',
          );
          expect(ensureReleaseBranchSpy).toHaveBeenCalledWith(project, '1.1.0');
        });
      });

      it('plans an ordinary release if given releaseType: "ordinary"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '2.0.0',
          });
        });
      });

      it('plans a backport release if given releaseType: "backport"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'backport',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '1.1.0',
          });
        });
      });

      it('follows the workflow correctly when executed twice', async () => {
        await withSandbox(async (sandbox) => {
          const releaseVersion = '1.1.0';
          const {
            project,
            output,
            determineReleaseVersionSpy,
            ensureReleaseBranchSpy,
            commitAllChangesSpy,
            projectDirectoryPath,
            fixConstraintsSpy,
            updateYarnLockfileSpy,
            deduplicateDependenciesSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            releaseVersion,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          determineReleaseVersionSpy.mockReturnValue(releaseVersion);
          ensureReleaseBranchSpy.mockResolvedValueOnce({ firstRun: true });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(ensureReleaseBranchSpy).toHaveBeenCalledTimes(1);
          expect(ensureReleaseBranchSpy).toHaveBeenLastCalledWith(
            project,
            releaseVersion,
          );

          expect(commitAllChangesSpy).toHaveBeenCalledTimes(2);
          expect(commitAllChangesSpy).toHaveBeenNthCalledWith(
            1,
            projectDirectoryPath,
            `Initialize Release ${releaseVersion}`,
            { allowEmpty: true },
          );
          expect(commitAllChangesSpy).toHaveBeenNthCalledWith(
            2,
            projectDirectoryPath,
            `Update Release ${releaseVersion}`,
          );

          expect(fixConstraintsSpy).toHaveBeenCalledTimes(1);
          expect(fixConstraintsSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            expect.any(Function),
          );

          expect(updateYarnLockfileSpy).toHaveBeenCalledTimes(1);
          expect(updateYarnLockfileSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            expect.any(Function),
          );

          expect(deduplicateDependenciesSpy).toHaveBeenCalledTimes(1);
          expect(deduplicateDependenciesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            expect.any(Function),
          );

          // Second call of followMonorepoWorkflow

          ensureReleaseBranchSpy.mockResolvedValueOnce({
            firstRun: false, // It's no longer the first run
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(ensureReleaseBranchSpy).toHaveBeenCalledTimes(2);
          expect(ensureReleaseBranchSpy).toHaveBeenLastCalledWith(
            project,
            releaseVersion,
          );

          expect(commitAllChangesSpy).toHaveBeenCalledTimes(3);
          expect(commitAllChangesSpy).toHaveBeenNthCalledWith(
            3,
            projectDirectoryPath,
            `Update Release ${releaseVersion}`,
          );
        });
      });

      it('attempts to execute the release spec if it was successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            executeReleasePlanSpy,
            releasePlan,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            releaseVersion: '2.0.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).toHaveBeenCalledWith(
            project,
            releasePlan,
            formatter,
            output,
          );
        });
      });

      it('should make exactly two commits named after the generated release version if editing, validating, and executing the release spec succeeds', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            releaseVersion: '4.38.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Initialize Release 2.0.0',
            { allowEmpty: true },
          );

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file after editing, validating, and executing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('does not attempt to execute the release spec if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the final release update commit when release spec was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            errorUponEditingReleaseSpec: new Error('oops'),
          });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Initialize Release 2.0.0',
            { allowEmpty: true },
          );
          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file even if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('throws an error produced while editing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow('oops');
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while validating the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponValidatingReleaseSpec = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponValidatingReleaseSpec,
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponValidatingReleaseSpec);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while planning the release', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponPlanningRelease = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponPlanningRelease,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponPlanningRelease);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while executing the release plan', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponExecutingReleasePlan = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponExecutingReleasePlan,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponExecutingReleasePlan);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is false, the release spec file does not already exist, and an editor is not available', () => {
      it('does not attempt to execute the edited release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the release update commit', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: false,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('prints a message', async () => {
        await withSandbox(async (sandbox) => {
          const { project, stdout, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(writtenText(stdout)).toContain(
            'A template has been generated that specifies this release',
          );
        });
      });

      it('does not remove the generated release spec file', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is false and the release spec file already exists', () => {
      it('does not open the editor', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            waitForUserToEditReleaseSpecificationSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(
            waitForUserToEditReleaseSpecificationSpy,
          ).not.toHaveBeenCalled();
        });
      });

      it('checks the release choices in the release spec with the shared rules', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
            });
          const checkResults: unknown[] = [];
          vi.mocked(
            releaseSpecificationModule.validateReleaseSpecification,
          ).mockImplementation(async (_releaseSpecificationPath, check) => {
            checkResults.push(await check({ foo: 'major' }));
            throw new Error('Invalid release spec');
          });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow('Invalid release spec');

          expect(checkResults).toStrictEqual([
            {
              errors: [
                {
                  packageName: 'foo',
                  entryIndex: 0,
                  problem: 'is not a package in the project',
                  hint: 'Check the name, or remove the line.',
                },
              ],
              dependencyFindings: {},
            },
          ]);
        });
      });

      it('plans an ordinary release if given releaseType: "ordinary"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '2.0.0',
          });
        });
      });

      it('plans a backport release if given releaseType: "backport"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'backport',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '1.1.0',
          });
        });
      });

      it('attempts to execute the edited release spec', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            executeReleasePlanSpy,
            releasePlan,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            releaseVersion: '2.0.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).toHaveBeenCalledWith(
            project,
            releasePlan,
            formatter,
            output,
          );
        });
      });

      it('should make exactly two commits named after the generated release version if validating and executing the release spec succeeds', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            releaseVersion: '4.38.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Initialize Release 2.0.0',
            { allowEmpty: true },
          );

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file after validating and executing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('does not remove the generated release spec file if an error is thrown while validating the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponValidatingReleaseSpec = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              errorUponValidatingReleaseSpec,
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponValidatingReleaseSpec);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if an error is thrown while planning the release', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponPlanningRelease = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              errorUponPlanningRelease,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponPlanningRelease);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if an error is thrown while executing the release plan', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponExecutingReleasePlan = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              errorUponExecutingReleasePlan,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: false,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponExecutingReleasePlan);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is true, the release spec file does not already exist, and an editor is available', () => {
      it('plans an ordinary release if given releaseType: "ordinary"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '2.0.0',
          });
        });
      });

      it('plans a backport release if given releaseType: "backport"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'backport',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '1.1.0',
          });
        });
      });

      it('attempts to execute the release spec if it was successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            executeReleasePlanSpy,
            releasePlan,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            releaseVersion: '2.0.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).toHaveBeenCalledWith(
            project,
            releasePlan,
            formatter,
            output,
          );
        });
      });

      it('should make exactly two commits named after the generated release version if editing, validating, and executing the release spec succeeds', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            releaseVersion: '4.38.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Initialize Release 2.0.0',
            { allowEmpty: true },
          );

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file after editing, validating, and executing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('does not attempt to execute the release spec if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the release update commit if the release spec was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: true,
            errorUponEditingReleaseSpec: new Error('oops'),
          });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file even if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('throws an error produced while editing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow('oops');
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while validating the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponValidatingReleaseSpec = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponValidatingReleaseSpec,
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponValidatingReleaseSpec);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while planning the release', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponPlanningRelease = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponPlanningRelease,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponPlanningRelease);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while executing the release plan', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponExecutingReleasePlan = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: true,
              errorUponExecutingReleasePlan,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponExecutingReleasePlan);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is true, the release spec file does not already exist, and an editor is not available', () => {
      it('does not attempt to execute the edited release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the release update commit', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: false,
            isEditorAvailable: false,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('prints a message', async () => {
        await withSandbox(async (sandbox) => {
          const { project, stdout, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(writtenText(stdout)).toContain(
            'A template has been generated that specifies this release',
          );
        });
      });

      it('does not remove the generated release spec file', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: false,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is true, the release spec file already exists, and an editor is available', () => {
      it('generates a new release spec instead of using the existing one', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            generateReleaseSpecificationTemplateForMonorepoSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(
            generateReleaseSpecificationTemplateForMonorepoSpy,
          ).toHaveBeenCalledWith({
            modeName: 'legacy',
            candidates: [],
            isEditorAvailable: true,
          });
        });
      });

      it('plans an ordinary release if given releaseType: "ordinary"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '2.0.0',
          });
        });
      });

      it('plans a backport release if given releaseType: "backport"', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            releaseSpecification,
            planReleaseSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'backport',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(planReleaseSpy).toHaveBeenCalledWith({
            project,
            releaseSpecificationPackages: releaseSpecification.packages,
            newReleaseVersion: '1.1.0',
          });
        });
      });

      it('attempts to execute the release spec if it was successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            executeReleasePlanSpy,
            releasePlan,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
            releaseVersion: '2.0.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).toHaveBeenCalledWith(
            project,
            releasePlan,
            formatter,
            output,
          );
        });
      });

      it('should make exactly two commits named after the generated release version if editing, validating, and executing the release spec succeeds', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
            releaseVersion: '4.38.0',
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Initialize Release 2.0.0',
            { allowEmpty: true },
          );

          expect(commitAllChangesSpy).toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file after editing, validating, and executing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('does not attempt to execute the release spec if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the release update commit if the release spec was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: true,
            errorUponEditingReleaseSpec: new Error('oops'),
          });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('removes the release spec file even if it was not successfully edited', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(expect.anything());

          expect(await fileExists(releaseSpecificationPath)).toBe(false);
        });
      });

      it('throws an error produced while editing the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponEditingReleaseSpec: new Error('oops'),
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow('oops');
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while validating the release spec', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponValidatingReleaseSpec = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponValidatingReleaseSpec,
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponValidatingReleaseSpec);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while planning the release', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponPlanningRelease = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponPlanningRelease,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponPlanningRelease);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });

      it('does not remove the generated release spec file if it was successfully edited but an error is thrown while executing the release plan', async () => {
        await withSandbox(async (sandbox) => {
          const errorUponExecutingReleasePlan = new Error('oops');
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: true,
              errorUponExecutingReleasePlan,
              releaseVersion: '2.0.0',
            });

          await expect(
            followMonorepoWorkflow({
              project,
              tempDirectoryPath: sandbox.directoryPath,
              firstRemovingExistingReleaseSpecification: true,
              releaseType: 'ordinary',
              defaultBranch: 'main',
              formatter,
              output,
            }),
          ).rejects.toThrow(errorUponExecutingReleasePlan);

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });

    describe('when firstRemovingExistingReleaseSpecification is true, the release spec file already exists, and an editor is not available', () => {
      it('generates a new release spec instead of using the existing one', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            generateReleaseSpecificationTemplateForMonorepoSpy,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: false,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(
            generateReleaseSpecificationTemplateForMonorepoSpy,
          ).toHaveBeenCalledWith({
            modeName: 'legacy',
            candidates: [],
            isEditorAvailable: false,
          });
        });
      });

      it('does not attempt to execute the edited release spec', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, executeReleasePlanSpy, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(executeReleasePlanSpy).not.toHaveBeenCalled();
        });
      });

      it('does not attempt to make the release update commit', async () => {
        await withSandbox(async (sandbox) => {
          const {
            project,
            output,
            commitAllChangesSpy,
            projectDirectoryPath,
            formatter,
          } = await setupFollowMonorepoWorkflow({
            sandbox,
            doesReleaseSpecFileExist: true,
            isEditorAvailable: false,
          });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(commitAllChangesSpy).not.toHaveBeenCalledWith(
            projectDirectoryPath,
            'Update Release 2.0.0',
          );
        });
      });

      it('prints a message', async () => {
        await withSandbox(async (sandbox) => {
          const { project, stdout, output, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(writtenText(stdout)).toContain(
            'A template has been generated that specifies this release',
          );
        });
      });

      it('does not remove the generated release spec file', async () => {
        await withSandbox(async (sandbox) => {
          const { project, output, releaseSpecificationPath, formatter } =
            await setupFollowMonorepoWorkflow({
              sandbox,
              doesReleaseSpecFileExist: true,
              isEditorAvailable: false,
            });

          await followMonorepoWorkflow({
            project,
            tempDirectoryPath: sandbox.directoryPath,
            firstRemovingExistingReleaseSpecification: true,
            releaseType: 'ordinary',
            defaultBranch: 'main',
            formatter,
            output,
          });

          expect(await fileExists(releaseSpecificationPath)).toBe(true);
        });
      });
    });
  });
});
