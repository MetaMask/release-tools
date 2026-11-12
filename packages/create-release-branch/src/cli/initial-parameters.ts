import os from 'os';
import path from 'path';

import type { FrontEndName } from '../core/front-end.js';
import type { ModeName } from '../core/mode.js';
import type { Formatter, ReleaseType } from '../core/types.js';
import { readProject, Project } from '../project/project.js';
import { readReleaseConfig } from '../project/release-config.js';
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
 * @throws If the interactive UI is asked for in Changesets mode.
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
  const modeName: ModeName = args.changesets
    ? 'changesets'
    : (await readReleaseConfig(projectDirectoryPath)).mode;
  if (modeName === 'changesets' && args.interactive) {
    throw new Error(
      [
        'The interactive UI does not support Changesets mode yet.',
        'Run this tool without --interactive to edit the release spec in your editor.',
      ].join('\n'),
    );
  }
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
    modeName,
    frontEndName: args.interactive ? 'ui' : 'editor',
    port: args.port,
    formatter: args.formatter as Formatter,
  };
}
