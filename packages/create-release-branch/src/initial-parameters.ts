import os from 'os';
import path from 'path';

import { readCommandLineArguments } from './command-line-arguments.js';
import { fileExists, WriteStreamLike } from './fs.js';
import { readProject, Project } from './project.js';

/**
 * The type of release being created as determined by the parent release.
 *
 * - An *ordinary* release includes features or fixes applied against the
 * latest release and is designated by bumping the first part of that release's
 * version string.
 * - A *backport* release includes fixes applied against a previous release and
 * is designated by bumping the second part of that release's version string.
 */
export type ReleaseType = 'ordinary' | 'backport';

/**
 * The name of the formatter to use for formatting the changelog.
 */
export type Formatter = 'oxfmt' | 'prettier';

/**
 * The source of the release.
 *
 * - *legacy* releases use the `Unreleased` sections of changelogs.
 * - *changesets* releases use the Changesets in the `.changeset` directory.
 */
export type ReleaseMode = 'legacy' | 'changesets';

type InitialParameters = {
  project: Project;
  tempDirectoryPath: string;
  reset: boolean;
  releaseType: ReleaseType;
  defaultBranch: string;
  interactive: boolean;
  port: number;
  formatter: Formatter;
  releaseMode: ReleaseMode;
};

/**
 * Reads the inputs given to this tool via `process.argv` and uses them to
 * gather information about the project the tool can use to run.
 *
 * @param args - The arguments to this function.
 * @param args.argv - The arguments to this executable.
 * @param args.cwd - The directory in which this executable was run.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @returns The initial parameters.
 */
export async function determineInitialParameters({
  argv,
  cwd,
  stderr,
}: {
  argv: string[];
  cwd: string;
  stderr: WriteStreamLike;
}): Promise<InitialParameters> {
  const args = await readCommandLineArguments(argv);

  const projectDirectoryPath = path.resolve(cwd, args.projectDirectory);
  const project = await readProject(projectDirectoryPath, { stderr });
  const tempDirectoryPath =
    args.tempDirectory === undefined
      ? path.join(
          os.tmpdir(),
          'create-release-branch',
          project.rootPackage.validatedManifest.name.replace('/', '__'),
        )
      : path.resolve(cwd, args.tempDirectory);
  const releaseMode: ReleaseMode =
    args.changesets &&
    (await fileExists(
      path.join(projectDirectoryPath, '.changeset', 'config.json'),
    ))
      ? 'changesets'
      : 'legacy';

  return {
    project,
    tempDirectoryPath,
    reset: args.reset,
    defaultBranch: args.defaultBranch,
    releaseType: args.backport ? 'backport' : 'ordinary',
    interactive: args.interactive,
    port: args.port,
    formatter: args.formatter as Formatter,
    releaseMode,
  };
}
