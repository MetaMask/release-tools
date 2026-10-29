import type { WriteStream } from 'fs';
import path from 'path';

import { determineEditor } from './editor.js';
import {
  ensureDirectoryPathExists,
  fileExists,
  removeFile,
  writeFile,
} from './fs.js';
import { ReleaseType } from './initial-parameters.js';
import { Project } from './project.js';
import { waitForUserToEditReleaseSpecification } from './release-specification.js';
import { commitAllChanges } from './repo.js';
import { createReleaseBranch } from './workflow-operations.js';
import {
  deduplicateDependencies,
  fixConstraints,
  updateYarnLockfile,
} from './yarn-commands.js';

/**
 * The parts of the release workflow that depend on how the desired package
 * versions are determined.
 */
export type ReleaseSource<Specification> = {
  /**
   * Whether the "Initialize Release" commit is created even if `prepare`
   * changes nothing.
   */
  allowEmptyInitializeCommit?: boolean;
  /**
   * Makes changes to the project on the first run, before the release branch
   * is first committed to.
   */
  prepare(): Promise<void>;
  /**
   * Generates the contents of the release spec file that the user edits.
   *
   * @param args - The arguments.
   * @param args.isEditorAvailable - Whether the user's editor will be opened
   * on the file.
   * @returns The contents of the release spec file.
   */
  generateReleaseSpecificationTemplate(args: {
    isEditorAvailable: boolean;
  }): Promise<string>;
  /**
   * Reads and validates the release spec file that the user edited.
   *
   * @param releaseSpecificationPath - The path to the release spec file.
   * @returns The validated release specification.
   */
  validateReleaseSpecification(
    releaseSpecificationPath: string,
  ): Promise<Specification>;
  /**
   * Applies the release specification to the project.
   *
   * @param args - The arguments.
   * @param args.releaseSpecification - The validated release specification.
   * @param args.newReleaseVersion - The version of the new release.
   */
  apply(args: {
    releaseSpecification: Specification;
    newReleaseVersion: string;
  }): Promise<void>;
};

/**
 * Creates (or switches to) the release branch. On the first run, prepares the
 * project with the release source and commits the result.
 *
 * @param args - The arguments to this function.
 * @param args.project - Information about the project.
 * @param args.releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @param args.source - The release source.
 * @returns The version of the new release.
 */
export async function startRelease<Specification>({
  project,
  releaseType,
  source,
}: {
  project: Project;
  releaseType: ReleaseType;
  source: ReleaseSource<Specification>;
}): Promise<{ newReleaseVersion: string }> {
  const { version: newReleaseVersion, firstRun } = await createReleaseBranch({
    project,
    releaseType,
  });

  if (firstRun) {
    await source.prepare();
    const commitMessage = `Initialize Release ${newReleaseVersion}`;
    if (source.allowEmptyInitializeCommit) {
      await commitAllChanges(project.directoryPath, commitMessage, {
        allowEmpty: true,
      });
    } else {
      await commitAllChanges(project.directoryPath, commitMessage);
    }
  }

  return { newReleaseVersion };
}

/**
 * Fixes constraints, updates the lockfile, deduplicates dependencies, and then
 * commits all changes for the release.
 *
 * @param args - The arguments to this function.
 * @param args.project - Information about the project.
 * @param args.newReleaseVersion - The version of the new release.
 */
export async function finishRelease({
  project,
  newReleaseVersion,
}: {
  project: Project;
  newReleaseVersion: string;
}): Promise<void> {
  await fixConstraints(project.directoryPath);
  await updateYarnLockfile(project.directoryPath);
  await deduplicateDependencies(project.directoryPath);
  await commitAllChanges(
    project.directoryPath,
    `Update Release ${newReleaseVersion}`,
  );
}

/**
 * Follows the release workflow:
 *
 * - The tool creates the release branch and, on the first run, prepares the
 * project with the release source.
 * - The tool generates a release spec template with the release source, then
 * presents it to the user. It first attempts to locate an appropriate code
 * editor on the user's computer (using the `EDITOR` environment variable if
 * that is defined, otherwise `code` if it is present) and opens the file there,
 * pausing while the user is editing the file. If no editor can be found, the
 * tool provides the user with the path to the template so that they can edit
 * it themselves, then exits.
 * - However the user has edited the file, the release source validates it and
 * applies the desired changes to the project.
 * - Finally, the tool updates dependencies and commits the changes.
 *
 * @param args - The arguments to this function.
 * @param args.project - Information about the project.
 * @param args.tempDirectoryPath - A directory in which to hold the generated
 * release spec file.
 * @param args.firstRemovingExistingReleaseSpecification - Sometimes it's
 * possible for a release specification that was created in a previous run to
 * stick around (due to an error). This will ensure that the file is removed
 * first.
 * @param args.releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @param args.source - The release source.
 * @param args.stdout - A stream that can be used to write to standard out.
 */
export async function followReleaseWorkflow<Specification>({
  project,
  tempDirectoryPath,
  firstRemovingExistingReleaseSpecification,
  releaseType,
  source,
  stdout,
}: {
  project: Project;
  tempDirectoryPath: string;
  firstRemovingExistingReleaseSpecification: boolean;
  releaseType: ReleaseType;
  source: ReleaseSource<Specification>;
  stdout: Pick<WriteStream, 'write'>;
}): Promise<void> {
  const { newReleaseVersion } = await startRelease({
    project,
    releaseType,
    source,
  });

  const releaseSpecificationPath = path.join(
    tempDirectoryPath,
    'RELEASE_SPEC.yml',
  );

  if (
    !firstRemovingExistingReleaseSpecification &&
    (await fileExists(releaseSpecificationPath))
  ) {
    stdout.write(
      'Release spec already exists. Picking back up from previous run.\n',
    );
  } else {
    const editor = await determineEditor();

    const releaseSpecificationTemplate =
      await source.generateReleaseSpecificationTemplate({
        isEditorAvailable: editor !== null,
      });
    await ensureDirectoryPathExists(tempDirectoryPath);
    await writeFile(releaseSpecificationPath, releaseSpecificationTemplate);

    if (!editor) {
      stdout.write(
        `${[
          'A template has been generated that specifies this release. Please open the following file in your editor of choice, then re-run this tool:',
          `${releaseSpecificationPath}`,
        ].join('\n\n')}\n`,
      );
      return;
    }

    try {
      await waitForUserToEditReleaseSpecification(
        releaseSpecificationPath,
        editor,
      );
    } catch (error) {
      await removeFile(releaseSpecificationPath);
      throw error;
    }
  }

  const releaseSpecification = await source.validateReleaseSpecification(
    releaseSpecificationPath,
  );

  await source.apply({ releaseSpecification, newReleaseVersion });
  await removeFile(releaseSpecificationPath);
  await finishRelease({ project, newReleaseVersion });
}
