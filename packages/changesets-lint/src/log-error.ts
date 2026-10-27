import { chalkStderr } from 'chalk';

/**
 * Writes an error message to stderr with a red cross prefix.
 *
 * @param error - The error or message to report.
 */
export function logError(error: unknown): void {
  console.error(
    `${chalkStderr.red('✖')} ${error instanceof Error ? error.message : String(error)}`,
  );
}
