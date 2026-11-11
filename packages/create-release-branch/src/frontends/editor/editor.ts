import { parse } from 'shell-quote';
import type { ParseEntry } from 'shell-quote';

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
 * Determines whether a parsed command entry is a plain word, as opposed to a
 * shell operator, glob, or comment.
 *
 * @param entry - The entry returned by `parse` from `shell-quote`.
 * @returns Whether the entry is a word.
 */
function isWord(entry: ParseEntry): entry is string {
  return typeof entry === 'string';
}

/**
 * Looks for an executable that represents a code editor on your computer. Tries
 * the `EDITOR` environment variable first, falling back to the executable that
 * represents VSCode (`code`). `EDITOR` can contain arguments, such as
 * `idea --wait`, and is split and expanded like a shell would do it (quote
 * paths that contain spaces or backslashes). An unquoted path that contains
 * spaces still works if it resolves as a whole.
 *
 * @returns A promise that contains information about the found editor (path and
 * arguments), or null otherwise.
 */
export async function determineEditor(): Promise<Editor | null> {
  const { EDITOR } = getEnvironmentVariables();

  if (EDITOR !== undefined) {
    try {
      // A value with shell operators (such as `|`) is not a single command, so
      // it is ignored.
      const words = parse(EDITOR, process.env);

      if (words.every(isWord)) {
        const [executable, ...args] = words;

        if (executable !== undefined) {
          const executablePath = await resolveExecutable(executable);

          if (executablePath !== null) {
            return { path: executablePath, args };
          }
        }

        if (args.length > 0) {
          const executablePath = await resolveExecutable(EDITOR);

          if (executablePath !== null) {
            return { path: executablePath, args: [] };
          }
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
