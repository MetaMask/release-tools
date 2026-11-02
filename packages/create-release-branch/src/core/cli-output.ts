import chalk, { Chalk, chalkStderr } from 'chalk';
import type { ChalkInstance } from 'chalk';
import ora from 'ora';

import type { WriteStreamLike } from '../utils/fs.js';

/**
 * The single place through which the tool writes user-facing messages.
 *
 * Each method writes the text exactly as given, so callers include any
 * trailing newline themselves. The one exception: when standard error is
 * styled, warnings and errors always end with a newline.
 *
 * @property info - Writes an informational message to standard out.
 * @property success - Writes a message about a completed action to standard
 * out.
 * @property warn - Writes a warning to standard error.
 * @property error - Writes an error to standard error.
 * @property step - Runs a long-running action and returns its result.
 */
export type CliOutput = {
  info(text: string): void;
  success(text: string): void;
  warn(text: string): void;
  error(text: string): void;
  step<Result>(label: string, run: () => Promise<Result>): Promise<Result>;
};

/**
 * Applies a color to the text, leaving any leading and trailing whitespace
 * outside of the color codes.
 *
 * @param text - The text.
 * @param color - The color to apply.
 * @returns The colored text.
 */
function colorize(text: string, color: ChalkInstance): string {
  const content = text.trim();
  const start = text.indexOf(content);
  return `${text.slice(0, start)}${color(content)}${text.slice(start + content.length)}`;
}

/**
 * Adds a newline to the end of the text if it does not already end with one.
 *
 * @param text - The text.
 * @returns The text, ending with a newline.
 */
function endWithNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Determines whether a stream is a terminal that shows colors.
 *
 * @param stream - The stream.
 * @param colorLevel - The color level that chalk detected for the stream.
 * @returns Whether to style what is written to the stream.
 */
function isColorTerminal(
  stream: { isTTY?: boolean },
  colorLevel: number,
): boolean {
  return (
    Boolean(stream.isTTY) &&
    colorLevel > 0 &&
    process.env.NO_COLOR === undefined
  );
}

/**
 * Creates a `CliOutput` that writes to the given streams.
 *
 * When standard out is styled, success messages are colored. When standard
 * error is styled, warnings and errors are colored and end with a newline,
 * and each step shows a spinner on standard error. Otherwise, the text is
 * written as given and steps write nothing.
 *
 * @param args - The arguments.
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @param args.styled - Whether to style each stream. By default, a stream is
 * styled when it is a terminal, chalk detects color support for it, and
 * `NO_COLOR` is not set.
 * @returns The output.
 */
export function createCliOutput({
  stdout,
  stderr,
  styled = {
    stdout: isColorTerminal(stdout, chalk.level),
    stderr: isColorTerminal(stderr, chalkStderr.level),
  },
}: {
  stdout: WriteStreamLike & { isTTY?: boolean };
  stderr: NodeJS.WritableStream & { isTTY?: boolean };
  styled?: { stdout: boolean; stderr: boolean };
}): CliOutput {
  const stdoutColors = new Chalk({ level: styled.stdout ? 1 : 0 });
  const stderrColors = new Chalk({ level: styled.stderr ? 1 : 0 });
  // A running spinner clears the current line on its next frame, which would
  // erase a message that does not end with a newline.
  const toStderr = (text: string): string =>
    styled.stderr ? endWithNewline(text) : text;

  return {
    info(text) {
      stdout.write(text);
    },
    success(text) {
      stdout.write(colorize(text, stdoutColors.green));
    },
    warn(text) {
      stderr.write(colorize(toStderr(text), stderrColors.yellow));
    },
    error(text) {
      stderr.write(colorize(toStderr(text), stderrColors.red));
    },
    async step(label, run) {
      if (!styled.stderr) {
        return await run();
      }

      // Leave stdin alone so that a prompt during the step still receives
      // keystrokes. Standard error is already known to be a color terminal
      // here, so ora's own check (which is off in CI) is skipped.
      const spinner = ora({
        text: label,
        stream: stderr,
        discardStdin: false,
        isEnabled: true,
      });
      spinner.start();
      try {
        const result = await run();
        spinner.succeed();
        return result;
      } catch (error) {
        spinner.fail();
        throw error;
      }
    },
  };
}
