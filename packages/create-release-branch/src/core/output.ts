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
export type Output = {
  info(text: string): void;
  success(text: string): void;
  warn(text: string): void;
  error(text: string): void;
  step<Result>(label: string, run: () => Promise<Result>): Promise<Result>;
};

/**
 * Creates an `Output` that writes plain text to the given streams.
 *
 * @param args - The arguments.
 * @param args.stdout - A stream that can be used to write to standard out.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @returns The output.
 */
export function createOutput({
  stdout,
  stderr,
}: {
  stdout: WriteStreamLike;
  stderr: WriteStreamLike;
}): Output {
  return {
    info(text) {
      stdout.write(text);
    },
    success(text) {
      stdout.write(text);
    },
    warn(text) {
      stderr.write(text);
    },
    error(text) {
      stderr.write(text);
    },
    async step(_label, run) {
      return await run();
    },
  };
}
