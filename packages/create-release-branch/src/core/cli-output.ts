import { Chalk } from 'chalk';
import type { ChalkInstance } from 'chalk';
import ora from 'ora';

import type { WriteStreamLike } from '../utils/fs.js';

/**
 * The single place through which the tool writes user-facing messages.
 *
 * Each method writes the text exactly as given, so callers include any
 * trailing newline themselves.
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
 * Creates a `CliOutput` that writes to the given streams.
 *
 * When styled, success, warnings, and errors are colored, and each step shows
 * a spinner on standard error. Otherwise, the text is written as given and
 * steps write nothing.
 *
 * @param args - The arguments.
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @param args.styled - Whether to show colors and spinners. Defaults to true
 * when standard out is a terminal and `NO_COLOR` is not set.
 * @returns The output.
 */
export function createCliOutput({
  stdout,
  stderr,
  styled = Boolean(stdout.isTTY) && process.env.NO_COLOR === undefined,
}: {
  stdout: WriteStreamLike & { isTTY?: boolean };
  stderr: NodeJS.WritableStream;
  styled?: boolean;
}): CliOutput {
  const chalk = new Chalk({ level: styled ? 1 : 0 });

  return {
    info(text) {
      stdout.write(text);
    },
    success(text) {
      stdout.write(colorize(text, chalk.green));
    },
    warn(text) {
      stderr.write(colorize(text, chalk.yellow));
    },
    error(text) {
      stderr.write(colorize(text, chalk.red));
    },
    async step(label, run) {
      if (!styled) {
        return await run();
      }

      const spinner = ora({ text: label, stream: stderr });
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
