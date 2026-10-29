import type { CommandModule } from 'yargs';

import { lint } from './lint.js';

const command = {
  command: '$0',
  describe: 'Validate all Changeset files in the current Yarn workspace.',
  handler: lint,
} satisfies CommandModule;

export default command;
