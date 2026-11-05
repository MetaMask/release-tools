import type { WriteStream } from 'fs';

import { createCliOutput } from './core/cli-output.js';
import { createEditorFrontEnd } from './frontends/editor/editor-front-end.js';
import { createUIFrontEnd } from './frontends/ui/server.js';
import { determineInitialParameters } from './initial-parameters.js';
import { createLegacyMode } from './modes/legacy/legacy-mode.js';

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
  const output = createCliOutput({ stdout, stderr });
  const {
    project,
    tempDirectoryPath,
    reset,
    releaseType,
    defaultBranch,
    interactive,
    port,
    formatter,
  } = await determineInitialParameters({ argv, cwd, output });

  if (project.isMonorepo) {
    output.info(
      'Project appears to have workspaces. Following monorepo workflow.\n',
    );

    const mode = createLegacyMode({
      project,
      defaultBranch,
      formatter,
      output,
    });
    const frontEnd = interactive
      ? createUIFrontEnd({ port })
      : createEditorFrontEnd({ tempDirectoryPath, reset });
    await frontEnd.run({ project, mode, releaseType, output });
  } else {
    output.info(
      'Project does not appear to have any workspaces. Following polyrepo workflow.\n',
    );
  }
}
