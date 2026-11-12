import os from 'os';
import path from 'path';

import type { FrontEndName } from '../core/front-end.js';
import type { ModeName } from '../core/mode.js';
import type { Formatter, ReleaseType } from '../core/types.js';
import { readProject, Project } from '../project/project.js';
import { readCommandLineArguments } from './command-line-arguments.js';

type InitialParameters = {
  project: Project;
  tempDirectoryPath: string;
  reset: boolean;
  releaseType: ReleaseType;
  defaultBranch: string;
  modeName: ModeName;
  frontEndName: FrontEndName;
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
 * @returns The initial parameters.
 */
export async function determineInitialParameters({
  argv,
  cwd,
}: {
  argv: string[];
  cwd: string;
}): Promise<InitialParameters> {
  const args = await readCommandLineArguments(argv);

  const projectDirectoryPath = path.resolve(cwd, args.projectDirectory);
  const project = await readProject(projectDirectoryPath);
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
    modeName: 'legacy',
    frontEndName: args.interactive ? 'ui' : 'editor',
    port: args.port,
    formatter: args.formatter as Formatter,
  };
}
