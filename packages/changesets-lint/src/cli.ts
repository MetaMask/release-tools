import yargs from 'yargs';
import type { CommandModule } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { logError } from './log-error.js';

/**
 * Parses the command line arguments and runs the matching command.
 *
 * @param argv - The raw command line arguments, including the Node and script paths.
 * @param commands - The commands to register.
 * @returns A promise that resolves when the command completes.
 */
export async function cli(
  argv: string[],
  commands: CommandModule[],
): Promise<void> {
  await yargs(hideBin(argv))
    .scriptName('changesets-lint')
    .command(commands)
    .strict()
    .fail((message: string | null, error: unknown) => {
      logError(message ?? error);
      // oxlint-disable-next-line unicorn/no-process-exit -- A failure handler must stop yargs before command dispatch.
      process.exit(1);
    })
    .help()
    .parseAsync();
}
