import type { WriteStream } from 'fs';

import { createCliOutput } from '../core/cli-output.js';
import { runRelease } from '../core/run-release.js';
import { createEditorFrontEnd } from '../frontends/editor/editor-front-end.js';
import { createUIFrontEnd } from '../frontends/ui/server.js';
import { createLegacyMode } from '../modes/legacy/legacy-mode.js';
import { determineInitialParameters } from './initial-parameters.js';

/**
 * The main function for this tool. Designed to not access `process.argv`,
 * `process.cwd()`, `process.stdout`, or `process.stderr` directly so as to be
 * more easily testable. The output still reads `NO_COLOR` and the color
 * support that chalk detects for the process streams.
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
  stderr: NodeJS.WritableStream;
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

  const mode = createLegacyMode({
    project,
    defaultBranch,
    formatter,
    output,
  });
  const frontEnd = interactive
    ? createUIFrontEnd({ port })
    : createEditorFrontEnd({ tempDirectoryPath, reset });

  await runRelease({ project, mode, releaseType, output }, frontEnd);
}
