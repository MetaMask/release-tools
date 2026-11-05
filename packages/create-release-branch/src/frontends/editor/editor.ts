import { parse } from 'shell-quote';

import { getEnvironmentVariables } from '../../utils/env.js';
import { debug, resolveExecutable } from '../../utils/misc-utils.js';

/**
 * Information about the editor present on the user's computer.
 *
 * @property path - The path to the executable representing the editor.
 * @property args - Command-line arguments to pass to the executable when
 * calling it.
 */
export type Editor = {
  path: string;
  args: string[];
};

/**
 * Looks for an executable that represents a code editor on your computer. Tries
 * the `EDITOR` environment variable first, falling back to the executable that
 * represents VSCode (`code`). `EDITOR` can contain arguments, such as
 * `idea --wait`, and is split like a shell would split it (quote paths that
 * contain spaces or backslashes).
 *
 * @returns A promise that contains information about the found editor (path and
 * arguments), or null otherwise.
 */
export async function determineEditor(): Promise<Editor | null> {
  const { EDITOR } = getEnvironmentVariables();

  if (EDITOR !== undefined) {
    try {
      // Variables are kept as they are, and a value with shell operators (such
      // as `|`) is not a single command, so it is ignored.
      const words = parse(EDITOR, (name) => `$${name}`);
      const [executable, ...args] = words;

      if (
        typeof executable === 'string' &&
        args.every((arg): arg is string => typeof arg === 'string')
      ) {
        const executablePath = await resolveExecutable(executable);

        if (executablePath !== null) {
          return { path: executablePath, args };
        }
      }
    } catch (error) {
      debug(
        `Could not resolve executable ${EDITOR} (${String(error)}), falling back to VSCode`,
      );
    }
  }

  try {
    const executablePath = await resolveExecutable('code');

    if (executablePath !== null) {
      // Waits until the file is closed before returning
      return { path: executablePath, args: ['--wait'] };
    }
  } catch (error) {
    debug(
      `Could not resolve path to VSCode: ${String(error)}, continuing regardless`,
    );
  }

  return null;
}
