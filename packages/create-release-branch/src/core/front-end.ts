import type { Project } from '../project/project.js';
import type { CliOutput } from './cli-output.js';
import type { Mode } from './mode.js';
import type { ReleaseType } from './types.js';

/**
 * What a front end needs to run a release.
 *
 * @property project - Information about the project.
 * @property mode - The release mode.
 * @property releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @property output - Where to write user-facing messages.
 */
export type ReleaseContext = {
  project: Project;
  mode: Mode<unknown>;
  releaseType: ReleaseType;
  output: CliOutput;
};

/**
 * Collects the release choices from the maintainer and shows the errors in
 * them. It drives the release steps of the core.
 *
 * @property run - Runs the release.
 */
export type FrontEnd = {
  run(context: ReleaseContext): Promise<void>;
};
