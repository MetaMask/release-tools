import { isCI, log, spinner, taskLog } from '@clack/prompts';
import { Writable } from 'node:stream';
import { stripVTControlCharacters, styleText } from 'node:util';

/**
 * The single place through which the tool writes user-facing messages.
 *
 * Each message is laid out by clack, which adds its own spacing, so any
 * trailing newlines in the text are dropped.
 *
 * @property info - Writes an informational message to standard out.
 * @property success - Writes a message about a completed action to standard
 * out.
 * @property warn - Writes a warning to standard error.
 * @property error - Writes an error to standard error.
 * @property step - Runs a long-running action and returns its result.
 * @property task - Runs a long-running action that prints lines of output,
 * such as a command, and returns its result. The lines are shown only while
 * the action runs, or if it fails.
 */
export type CliOutput = {
  info(text: string): void;
  success(text: string): void;
  warn(text: string): void;
  error(text: string): void;
  step<Result>(label: string, run: () => Promise<Result>): Promise<Result>;
  task<Result>(
    label: string,
    run: (log: (line: string) => void) => Promise<Result>,
  ): Promise<Result>;
};

/**
 * A stream that the output can write to, such as `process.stdout`.
 */
export type OutputStream = Writable & {
  isTTY?: boolean;
  columns?: number;
  hasColors?: () => boolean;
};

/**
 * A key that `readline` reports in a `keypress` event.
 */
type Key = { ctrl?: boolean; name?: string };

/**
 * The exit code that shells use for a process stopped with Ctrl+C.
 */
const INTERRUPTED_EXIT_CODE = 130;

let isExitingOnInterrupt = false;

/**
 * Runs an action and exits with code 130 if the user presses Ctrl+C
 * meanwhile.
 *
 * A clack spinner reads standard in in raw mode, so Ctrl+C arrives as a
 * keypress, on which clack exits with code 0. The spinner also listens to
 * SIGINT, and then only stops itself. The listeners here are added before any
 * spinner starts, so they run first: Ctrl+C becomes a SIGINT, and a SIGINT
 * exits with code 130. The SIGINT listener is added once and stays, so a
 * later SIGINT also exits with code 130, the code a shell reports by default.
 *
 * @param run - The action.
 * @returns The result of the action.
 */
async function exitOnInterrupt<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  if (!isExitingOnInterrupt) {
    isExitingOnInterrupt = true;
    process.on('SIGINT', () => {
      process.exit(INTERRUPTED_EXIT_CODE);
    });
  }

  const onKeypress = (_input: unknown, key: Key | undefined): void => {
    if (key?.ctrl && key.name === 'c') {
      process.emit('SIGINT', 'SIGINT');
    }
  };
  process.stdin.on('keypress', onKeypress);

  try {
    return await run();
  } finally {
    process.stdin.off('keypress', onKeypress);
  }
}

/**
 * Determines whether a stream is a terminal that shows colors.
 *
 * @param stream - The stream.
 * @returns Whether to style what is written to the stream.
 */
function isColorTerminal(stream: OutputStream): boolean {
  return (
    Boolean(stream.isTTY) &&
    (stream.hasColors?.() ?? false) &&
    process.env.NO_COLOR === undefined
  );
}

/**
 * Wraps a stream so that what is written to it has no ANSI codes. clack
 * decides on colors from `process.stdout`, even for text sent to another
 * stream.
 *
 * @param stream - The stream.
 * @returns The wrapped stream.
 */
function withoutColors(stream: Writable): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback): void {
      stream.write(stripVTControlCharacters(chunk.toString()));
      callback();
    },
  });
}

/**
 * Removes the newlines at the end of the text.
 *
 * @param text - The text.
 * @returns The text, without trailing newlines.
 */
function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/u, '');
}

/**
 * Creates a `CliOutput` that writes to the given streams.
 *
 * Messages, and lines for completed steps and tasks, go to standard out.
 * Warnings, errors, spinners, and task output go to standard error. A stream
 * that is not styled gets no ANSI codes. When animating, a step shows a
 * spinner and a task streams its output until it ends. Otherwise, each ends
 * with one line, and a task prints its output only if it fails.
 *
 * @param args - The arguments.
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @param args.styled - Whether to style each stream. By default, a stream is
 * styled when it is a terminal that has colors and `NO_COLOR` is not set.
 * @param args.animate - Whether to show spinners and live task output on
 * standard error. By default, this is the case when standard error is styled
 * and reports a width, outside of CI, and when `TERM` is not `dumb`.
 * @returns The output.
 */
export function createCliOutput({
  stdout,
  stderr,
  styled = {
    stdout: isColorTerminal(stdout),
    stderr: isColorTerminal(stderr),
  },
  animate = styled.stderr &&
    Boolean(stderr.columns) &&
    !isCI() &&
    process.env.TERM !== 'dumb',
}: {
  stdout: OutputStream;
  stderr: OutputStream;
  styled?: { stdout: boolean; stderr: boolean };
  animate?: boolean;
}): CliOutput {
  const toStdout = { output: styled.stdout ? stdout : withoutColors(stdout) };
  const toStderr = { output: styled.stderr ? stderr : withoutColors(stderr) };

  return {
    info(text) {
      log.info(trimTrailingNewlines(text), toStdout);
    },
    success(text) {
      log.success(trimTrailingNewlines(text), toStdout);
    },
    warn(text) {
      log.warn(trimTrailingNewlines(text), toStderr);
    },
    error(text) {
      log.error(trimTrailingNewlines(text), toStderr);
    },
    async step(label, run) {
      if (!animate) {
        try {
          const result = await run();
          log.step(label, toStdout);
          return result;
        } catch (error) {
          log.error(label, toStderr);
          throw error;
        }
      }

      // clack shows `errorMessage` if the process exits during the step.
      const indicator = spinner({ ...toStderr, errorMessage: label });
      return await exitOnInterrupt(async () => {
        indicator.start(label);
        try {
          const result = await run();
          indicator.stop(label);
          return result;
        } catch (error) {
          indicator.error(label);
          throw error;
        }
      });
    },
    async task(label, run) {
      if (!animate) {
        const lines: string[] = [];
        try {
          const result = await run((line) => {
            lines.push(line);
          });
          log.step(label, toStdout);
          return result;
        } catch (error) {
          log.error(label, toStderr);
          log.message(
            lines.map((line) => styleText('dim', line, { stream: stderr })),
            toStderr,
          );
          throw error;
        }
      }

      const taskOutput = taskLog({ title: label, ...toStderr });
      return await exitOnInterrupt(async () => {
        try {
          const result = await run((line) => {
            taskOutput.message(line);
          });
          taskOutput.success(label);
          return result;
        } catch (error) {
          taskOutput.error(label, { showLog: true });
          throw error;
        }
      });
    },
  };
}
