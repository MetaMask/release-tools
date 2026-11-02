import os from 'os';
import path from 'path';

import { readCommandLineArguments } from './command-line-arguments.js';
import type { CliOutput } from './core/cli-output.js';
import type { Formatter, ReleaseType } from './core/types.js';
import { readProject, Project } from './project/project.js';

type InitialParameters = {
  project: Project;
  tempDirectoryPath: string;
  reset: boolean;
  releaseType: ReleaseType;
  defaultBranch: string;
  interactive: boolean;
  port: number;
  formatter: Formatter;
};

/**
 * Reads the inputs given to this tool via `process.argv` and uses them to
 * gather information about the project the tool can use to run.
 *
 * @param args - The arguments to this function.
 * @param args.argv - The arguments to this executable.
 * @param args.cwd - The directory in which this executable was run.
 * @param args.output - Where to write user-facing messages.
 * @returns The initial parameters.
 */
export async function determineInitialParameters({
  argv,
  cwd,
  output,
}: {
  argv: string[];
  cwd: string;
  output: CliOutput;
}): Promise<InitialParameters> {
  const args = await readCommandLineArguments(argv);

  const projectDirectoryPath = path.resolve(cwd, args.projectDirectory);
  const project = await readProject(projectDirectoryPath, { output });
  const tempDirectoryPath =
    args.tempDirectory === undefined
      ? path.join(
          os.tmpdir(),
          'create-release-branch',
          project.rootPackage.validatedManifest.name.replace('/', '__'),
        )
      : path.resolve(cwd, args.tempDirectory);

  return {
    project,
    tempDirectoryPath,
    reset: args.reset,
    defaultBranch: args.defaultBranch,
    releaseType: args.backport ? 'backport' : 'ordinary',
    interactive: args.interactive,
    port: args.port,
    formatter: args.formatter as Formatter,
  };
}
