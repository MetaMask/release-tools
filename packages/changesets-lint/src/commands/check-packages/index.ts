import type { Argv, CommandModule } from 'yargs';

import { checkPackages } from './check-packages.js';

const command = {
  command: 'check-packages',
  describe: 'Check that changed packages have matching Changeset files.',
  builder: (yargs): Argv<{ since: string }> =>
    yargs.option('since', {
      type: 'string',
      default: 'origin/main',
      description: 'Base git ref or commit SHA to compare against HEAD.',
    }),
  handler: checkPackages,
} satisfies CommandModule;

export default command;
