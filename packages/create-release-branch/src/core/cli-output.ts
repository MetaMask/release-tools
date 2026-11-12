import { log, spinner, taskLog } from '@clack/prompts';
import { Writable } from 'node:stream';
import type { WriteStream } from 'node:tty';
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
export type OutputStream = Writable &
  Partial<Pick<WriteStream, 'isTTY' | 'columns' | 'hasColors'>>;

/**
 * A key that `readline` reports in a `keypress` event.
 */
type Key = { ctrl?: boolean; name?: string };

/**
 * The number of lines of output that a running task shows.
 */
const TASK_LOG_LIMIT = 10;

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
 * and reports a width, and when `TERM` is not `dumb`.
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

      // clack calls `onCancel` when a signal stops the spinner. But the spinner
      // reads standard in in raw mode, so Ctrl+C arrives as a keypress, and
      // on Ctrl+C or Escape clack exits with code 0. The listener here is
      // added before the spinner starts, so it runs first and cancels the
      // spinner through its abort signal. By then clack has restored the
      // terminal, so `onCancel` ends the process the way Ctrl+C normally
      // does.
      const cancellation = new AbortController();
      const onKeypress = (_input: unknown, key: Key | undefined): void => {
        if ((key?.ctrl && key.name === 'c') || key?.name === 'escape') {
          cancellation.abort();
        }
      };
      const indicator = spinner({
        ...toStderr,
        cancelMessage: label,
        errorMessage: label,
        signal: cancellation.signal,
        onCancel: () => process.kill(process.pid, 'SIGINT'),
      });

      process.stdin.on('keypress', onKeypress);
      indicator.start(label);
      try {
        const result = await run();
        indicator.stop(label);
        return result;
      } catch (error) {
        indicator.error(label);
        throw error;
      } finally {
        process.stdin.off('keypress', onKeypress);
      }
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

      // clack redraws every shown line on each message, which breaks once the
      // lines are taller than the terminal. `retainLog` keeps the full log
      // for a failure.
      const taskOutput = taskLog({
        title: label,
        limit: TASK_LOG_LIMIT,
        retainLog: true,
        ...toStderr,
      });
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
    },
  };
}
