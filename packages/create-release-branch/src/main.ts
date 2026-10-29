import type { WriteStream } from 'fs';

import { createChangesetsReleaseSource } from './changesets-release-source.js';
import { determineInitialParameters } from './initial-parameters.js';
import { followMonorepoWorkflow } from './monorepo-workflow-operations.js';
import { followReleaseWorkflow } from './release-workflow.js';
import { startUI } from './ui.js';

/**
 * The main function for this tool. Designed to not access `process.argv`,
 * `process.env`, `process.cwd()`, `process.stdout`, or `process.stderr`
 * directly so as to be more easily testable.
 *
 * @param args - The arguments.
 * @param args.argv - The name of this executable and its arguments (as obtained
 * via `process.argv`).
 * @param args.cwd - The directory in which this executable was run.
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 */
export async function main({
  argv,
  cwd,
  stdout,
  stderr,
}: {
  argv: string[];
  cwd: string;
  stdout: Pick<WriteStream, 'write'>;
  stderr: Pick<WriteStream, 'write'>;
}): Promise<void> {
  const {
    project,
    tempDirectoryPath,
    reset,
    releaseType,
    defaultBranch,
    interactive,
    port,
    formatter,
    releaseMode,
  } = await determineInitialParameters({ argv, cwd, stderr });

  if (project.isMonorepo) {
    stdout.write(
      'Project appears to have workspaces. Following monorepo workflow.\n',
    );

    if (releaseMode === 'changesets') {
      if (interactive) {
        throw new Error(
          'The interactive UI (--interactive) is not supported in Changesets mode yet. Run without --interactive to edit the release spec in your editor, or pass --no-changesets to use the legacy workflow.',
        );
      }

      await followReleaseWorkflow({
        project,
        tempDirectoryPath,
        firstRemovingExistingReleaseSpecification: reset,
        releaseType,
        source: createChangesetsReleaseSource({ project, formatter, stderr }),
        stdout,
      });
    } else if (interactive) {
      await startUI({
        project,
        releaseType,
        defaultBranch,
        port,
        formatter,
        stdout,
        stderr,
      });
    } else {
      await followMonorepoWorkflow({
        project,
        tempDirectoryPath,
        firstRemovingExistingReleaseSpecification: reset,
        releaseType,
        defaultBranch,
        formatter,
        stdout,
        stderr,
      });
    }
  } else {
    stdout.write(
      'Project does not appear to have any workspaces. Following polyrepo workflow.\n',
    );
  }
}
