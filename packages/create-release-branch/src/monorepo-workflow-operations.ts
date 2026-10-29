import type { WriteStream } from 'fs';

import { Formatter, ReleaseType } from './initial-parameters.js';
import { createLegacyReleaseSource } from './legacy-release-source.js';
import { Project } from './project.js';
import { followReleaseWorkflow } from './release-workflow.js';

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
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 */
export async function followMonorepoWorkflow({
  project,
  tempDirectoryPath,
  firstRemovingExistingReleaseSpecification,
  releaseType,
  defaultBranch,
  formatter,
  stdout,
  stderr,
}: {
  project: Project;
  tempDirectoryPath: string;
  firstRemovingExistingReleaseSpecification: boolean;
  releaseType: ReleaseType;
  defaultBranch: string;
  formatter: Formatter;
  stdout: Pick<WriteStream, 'write'>;
  stderr: Pick<WriteStream, 'write'>;
}): Promise<void> {
  await followReleaseWorkflow({
    project,
    tempDirectoryPath,
    firstRemovingExistingReleaseSpecification,
    releaseType,
    source: createLegacyReleaseSource({
      project,
      defaultBranch,
      formatter,
      stderr,
    }),
    stdout,
  });
}
