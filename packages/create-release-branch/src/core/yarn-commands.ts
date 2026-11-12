import { debug, runCommandWithOutput } from '../utils/misc-utils.js';

/**
 * Runs `yarn constraints --fix` to autofix all unmet constraints.
 *
 * @param repositoryDirectoryPath - The path to the repository directory.
 * @param onLine - Receives each line of output of the command.
 * @throws An execa error object if the command fails in some way.
 */
export async function fixConstraints(
  repositoryDirectoryPath: string,
  onLine: (line: string) => void,
): Promise<void> {
  await runCommandWithOutput(
    'yarn',
    ['constraints', '--fix'],
    { cwd: repositoryDirectoryPath },
    onLine,
  );
  debug('Yarn constraints fixed successfully.');
}

/**
 * Runs `yarn install --no-immutable` to update the Yarn lockfile.
 *
 * @param repositoryDirectoryPath - The path to the repository directory.
 * @param onLine - Receives each line of output of the command.
 * @throws An execa error object if the command fails in some way.
 */
export async function updateYarnLockfile(
  repositoryDirectoryPath: string,
  onLine: (line: string) => void,
): Promise<void> {
  debug('Installing dependencies...');
  await runCommandWithOutput(
    'yarn',
    ['install', '--no-immutable'],
    { cwd: repositoryDirectoryPath },
    onLine,
  );
}

/**
 * Runs `yarn dedupe` to deduplicate dependencies in the project.
 *
 * @param repositoryDirectoryPath - The path to the repository directory.
 * @param onLine - Receives each line of output of the command.
 * @throws An execa error object if the command fails in some way.
 */
export async function deduplicateDependencies(
  repositoryDirectoryPath: string,
  onLine: (line: string) => void,
): Promise<void> {
  debug('Deduplicating dependencies...');
  await runCommandWithOutput(
    'yarn',
    ['dedupe'],
    { cwd: repositoryDirectoryPath },
    onLine,
  );
}
