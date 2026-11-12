import { createCliOutput } from '../core/cli-output.js';
import type { OutputStream } from '../core/cli-output.js';
import { runRelease } from '../core/run-release.js';
import { determineInitialParameters } from './initial-parameters.js';
import { selectFrontEnd, selectMode } from './select.js';

/**
 * The main function for this tool. Designed to not access `process.argv`,
 * `process.cwd()`, `process.stdout`, or `process.stderr` directly so as to be
 * more easily testable. The output still reads `NO_COLOR` and `TERM`,
 * and clack picks the colors of its symbols from `process.stdout`.
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
  stdout: OutputStream;
  stderr: OutputStream;
}): Promise<void> {
  const output = createCliOutput({ stdout, stderr });
  const {
    project,
    tempDirectoryPath,
    reset,
    releaseType,
    defaultBranch,
    modeName,
    frontEndName,
    port,
    formatter,
  } = await determineInitialParameters({ argv, cwd, output });

  const mode = selectMode(modeName, {
    project,
    defaultBranch,
    formatter,
    output,
  });
  const frontEnd = selectFrontEnd(frontEndName, {
    tempDirectoryPath,
    reset,
    port,
  });

  await runRelease({ project, mode, releaseType, output }, frontEnd);
}
