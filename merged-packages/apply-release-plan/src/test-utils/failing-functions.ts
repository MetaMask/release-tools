// plugin, must have a default export

import type { ChangelogFunctions } from '@changesets/types';

export default {
  getReleaseLine: (): string => {
    throw new Error('no chance');
  },
  getDependencyReleaseLine: (): string => {
    throw new Error('no chance');
  },
} satisfies ChangelogFunctions;
