import path from 'path';

import type { CliOutput } from './core/cli-output.js';
import {
  applyRelease,
  checkChoices,
  finishRelease,
  startRelease,
} from './core/release-steps.js';
import type { Formatter, ReleaseType } from './core/types.js';
import { determineEditor } from './editor.js';
import { createLegacyMode } from './modes/legacy/legacy-mode.js';
import type { Project } from './project/project.js';
import {
  generateReleaseSpecificationTemplateForMonorepo,
  waitForUserToEditReleaseSpecification,
  validateReleaseSpecification,
} from './release-specification.js';
import {
  ensureDirectoryPathExists,
  fileExists,
  removeFile,
  writeFile,
} from './utils/fs.js';

/**
 * For a monorepo, the process works like this:
 *
 * - The tool generates a release spec template, listing the workspace packages
 * in the project that have changed since the last release (or all of the
 * packages if this would be the first release).
 * - The tool then presents the template to the user so that they can specify
 * the desired versions for each package. It first does this by attempting to
 * locate an appropriate code editor on the user's computer (using the `EDITOR`
 * environment variable if that is defined, otherwise `code` if it is present)
 * and opening the file there, pausing while the user is editing the file. If no
 * editor can be found, the tool provides the user with the path to the template
 * so that they can edit it themselves, then exits.
 * - However the user has edited the file, the tool will parse and validate the
 * information in the file, then apply the desired changes to the monorepo.
 * - Finally, once it has made the desired changes, the tool will create a Git
 * commit that includes the changes, then create a branch using the current date
 * as the name.
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
 * @param args.defaultBranch - The name of the default branch in the repository.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @param args.output - Where to write user-facing messages.
 */
export async function followMonorepoWorkflow({
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
  const { newReleaseVersion } = await startRelease({
    project,
    releaseType,
    mode,
  });

  const releaseSpecificationPath = path.join(
    tempDirectoryPath,
    'RELEASE_SPEC.yml',
  );

  if (
    !firstRemovingExistingReleaseSpecification &&
    (await fileExists(releaseSpecificationPath))
  ) {
    output.info(
      'Release spec already exists. Picking back up from previous run.\n',
    );
  } else {
    const editor = await determineEditor();

    const releaseSpecificationTemplate =
      await generateReleaseSpecificationTemplateForMonorepo({
        candidates: await mode.listCandidates(),
        isEditorAvailable: editor !== null,
      });
    await ensureDirectoryPathExists(tempDirectoryPath);
    await writeFile(releaseSpecificationPath, releaseSpecificationTemplate);

    if (!editor) {
      output.info(
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

  const plan = await validateReleaseSpecification(
    releaseSpecificationPath,
    async (choices) => await checkChoices({ project, mode, choices }),
  );

  await applyRelease({ mode, plan, newReleaseVersion });
  await removeFile(releaseSpecificationPath);
  await finishRelease({ project, newReleaseVersion });
}
