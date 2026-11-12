import path from 'path';

import type { CliOutput } from '../core/cli-output.js';
import { MODE_NAMES } from '../core/mode.js';
import type { ModeName } from '../core/mode.js';
import { UserFacingError } from '../core/user-facing-error.js';
import type { ErrorDescription } from '../core/user-facing-error.js';
import { fileExists, readJsonObjectFile } from '../utils/fs.js';

/**
 * The name of the file that configures the tool for a project.
 */
export const RELEASE_CONFIG_FILE_NAME = 'release.config.json';

/**
 * The settings of the tool for a project.
 *
 * @property mode - The release mode.
 */
export type ReleaseConfig = {
  mode: ModeName;
};

/**
 * An error for a `mode` in `release.config.json` that is not the name of a
 * release mode.
 */
export class ReleaseConfigModeError extends UserFacingError {
  mode: unknown;

  configPath: string;

  /**
   * Creates the error.
   *
   * @param args - The arguments.
   * @param args.mode - The value of `mode` in the file.
   * @param args.configPath - The path to the file.
   */
  constructor({ mode, configPath }: { mode: unknown; configPath: string }) {
    super();
    this.mode = mode;
    this.configPath = configPath;
    const { title, lines } = this.describe({
      name: (text) => text,
      dim: (text) => text,
    });
    this.message = [title, ...lines].join('\n');
  }

  describe(format: CliOutput['format']): ErrorDescription {
    return {
      title: `The "mode" in ${format.name(RELEASE_CONFIG_FILE_NAME)} is not valid: ${JSON.stringify(this.mode)}`,
      lines: [
        `Use one of: ${MODE_NAMES.map((name) => `"${name}"`).join(', ')}.`,
        format.dim(this.configPath),
      ],
    };
  }
}

/**
 * Reads `release.config.json` from the root of the project. A project
 * without this file, or without a `mode` in it, uses the legacy mode. Other
 * properties, such as `versioningStrategy`, are not read.
 *
 * @param projectDirectoryPath - The path to the project.
 * @returns The settings.
 * @throws If the file is not a JSON object. A `ReleaseConfigModeError` if
 * `mode` is not the name of a release mode.
 */
export async function readReleaseConfig(
  projectDirectoryPath: string,
): Promise<ReleaseConfig> {
  const configPath = path.join(projectDirectoryPath, RELEASE_CONFIG_FILE_NAME);

  if (!(await fileExists(configPath))) {
    return { mode: 'legacy' };
  }

  const { mode = 'legacy' } = await readJsonObjectFile(configPath);

  if (!MODE_NAMES.some((name) => name === mode)) {
    throw new ReleaseConfigModeError({ mode, configPath });
  }

  return { mode: mode as ModeName };
}
