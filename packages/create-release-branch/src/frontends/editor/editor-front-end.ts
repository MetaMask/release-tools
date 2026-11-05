import path from 'path';

import type { FrontEnd, ReleaseContext } from '../../core/front-end.js';
import {
  applyRelease,
  checkChoices,
  finishRelease,
  startRelease,
} from '../../core/release-steps.js';
import {
  ensureDirectoryPathExists,
  fileExists,
  removeFile,
  writeFile,
} from '../../utils/fs.js';
import { determineEditor } from './editor.js';
import {
  generateReleaseSpecificationTemplateForMonorepo,
  waitForUserToEditReleaseSpecification,
  validateReleaseSpecification,
} from './release-specification.js';

/**
 * Creates the front end that collects the release choices through a release
 * spec file (`RELEASE_SPEC.yml`) that the user edits.
 *
 * @param args - The arguments.
 * @param args.tempDirectoryPath - A directory in which to hold the generated
 * release spec file.
 * @param args.reset - Sometimes it's possible for a release specification that
 * was created in a previous run to stick around (due to an error). This will
 * ensure that the file is removed first.
 * @returns The front end.
 */
export function createEditorFrontEnd({
  tempDirectoryPath,
  reset,
}: {
  tempDirectoryPath: string;
  reset: boolean;
}): FrontEnd {
  return {
    async run(context) {
      await followEditorWorkflow({ ...context, tempDirectoryPath, reset });
    },
  };
}

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
 * @param args.mode - The release mode.
 * @param args.releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @param args.output - Where to write user-facing messages.
 * @param args.tempDirectoryPath - A directory in which to hold the generated
 * release spec file.
 * @param args.reset - Whether to replace a release spec that a previous run
 * left behind.
 */
async function followEditorWorkflow({
  project,
  mode,
  releaseType,
  output,
  tempDirectoryPath,
  reset,
}: ReleaseContext & {
  tempDirectoryPath: string;
  reset: boolean;
}): Promise<void> {
  const { newReleaseVersion } = await startRelease({
    project,
    releaseType,
    mode,
  });

  const releaseSpecificationPath = path.join(
    tempDirectoryPath,
    'RELEASE_SPEC.yml',
  );

  if (!reset && (await fileExists(releaseSpecificationPath))) {
    output.info(
      'Release spec already exists. Picking back up from previous run.\n',
    );
  } else {
    const editor = await determineEditor();

    const releaseSpecificationTemplate =
      await generateReleaseSpecificationTemplateForMonorepo({
        modeName: mode.name,
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
