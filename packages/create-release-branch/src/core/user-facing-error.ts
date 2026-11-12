import type { CliOutput } from './cli-output.js';

/**
 * How an error is shown to the user.
 *
 * @property title - The title.
 * @property lines - The lines of details.
 */
export type ErrorDescription = { title: string; lines: string[] };

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
  abstract describe(format: CliOutput['format']): ErrorDescription;
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
): ErrorDescription {
  if (error instanceof UserFacingError) {
    return error.describe(format);
  }

  const [title, ...lines] = messageOf(error).split('\n');

  const seen = new Set<unknown>([error]);
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    lines.push(`Caused by: ${messageOf(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }

  if (debug && error instanceof Error && error.stack !== undefined) {
    lines.push('', ...error.stack.split('\n'));
  }

  return { title, lines };
}

/**
 * Describes an error to the user, then writes it as one error message: the
 * title, then the lines of details.
 *
 * @param output - Where to write the error.
 * @param error - The error.
 * @param options - The options.
 * @param options.debug - Whether to include the stack trace.
 */
export function writeError(
  output: Pick<CliOutput, 'error' | 'format'>,
  error: unknown,
  options: { debug: boolean },
): void {
  const { title, lines } = describeError(error, output.format, options);
  output.error([title, ...lines].join('\n'));
}
