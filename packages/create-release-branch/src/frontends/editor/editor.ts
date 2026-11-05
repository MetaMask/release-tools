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
 * Splits a command into words at whitespace. Single or double quotes keep
 * whitespace inside a word. Other shell syntax, such as backslash escapes and
 * variables, is kept as it is.
 *
 * @param command - The command to split, such as `idea --wait`.
 * @returns The words in the command.
 * @throws If a quote is not closed.
 */
export function splitCommand(command: string): string[] {
  const words: string[] = [];
  let word = '';
  let isInWord = false;
  let quote: string | null = null;

  for (const character of command) {
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        word += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      isInWord = true;
    } else if (/\s/u.test(character)) {
      if (isInWord) {
        words.push(word);
        word = '';
        isInWord = false;
      }
    } else {
      word += character;
      isInWord = true;
    }
  }

  if (quote !== null) {
    throw new Error(`Unclosed quote in ${command}`);
  }

  if (isInWord) {
    words.push(word);
  }

  return words;
}

/**
 * Looks for an executable that represents a code editor on your computer. Tries
 * the `EDITOR` environment variable first, falling back to the executable that
 * represents VSCode (`code`). `EDITOR` can contain arguments, such as
 * `idea --wait`.
 *
 * @returns A promise that contains information about the found editor (path and
 * arguments), or null otherwise.
 */
export async function determineEditor(): Promise<Editor | null> {
  const { EDITOR } = getEnvironmentVariables();

  if (EDITOR !== undefined && EDITOR.trim() !== '') {
    try {
      const [executable, ...args] = splitCommand(EDITOR);
      const executablePath = await resolveExecutable(executable);

      if (executablePath !== null) {
        return { path: executablePath, args };
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
