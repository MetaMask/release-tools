import type { CliOutput } from './cli-output.js';

/**
 * An error that describes itself to the user, with a title and lines of
 * details, instead of being printed with its message, causes, and stack.
 */
export abstract class UserFacingError extends Error {
  /**
   * Describes the error to the user.
   *
   * @param format - Styles parts of the text.
   * @returns The title and the lines of details.
   */
  abstract describe(format: CliOutput['format']): {
    title: string;
    lines: string[];
  };
}

/**
 * Gets the message of an error, or the text of a value that is not an error.
 *
 * @param error - The error.
 * @returns The message.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Describes an error to the user. A `UserFacingError` describes itself. Any
 * other error is described by its message, then one `Caused by` line for each
 * error in its chain of causes, then its stack trace when debugging.
 *
 * @param error - The error.
 * @param format - Styles parts of the text.
 * @param options - The options.
 * @param options.debug - Whether to include the stack trace.
 * @returns The title and the lines of details.
 */
export function describeError(
  error: unknown,
  format: CliOutput['format'],
  { debug }: { debug: boolean },
): { title: string; lines: string[] } {
  if (error instanceof UserFacingError) {
    return error.describe(format);
  }

  const [title, ...lines] = messageOf(error).split('\n');

  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined) {
    lines.push(`Caused by: ${messageOf(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }

  if (debug && error instanceof Error && error.stack !== undefined) {
    lines.push('', ...error.stack.split('\n'));
  }

  return { title, lines };
}
