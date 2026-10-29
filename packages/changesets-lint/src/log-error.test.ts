import { chalkStderr } from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logError } from './log-error.js';

describe('logError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it.each([
    [
      new Error('Could not lint Changeset files.'),
      'Could not lint Changeset files.',
    ],
    ['Invalid Yarn configuration.', 'Invalid Yarn configuration.'],
    [undefined, 'undefined'],
    [null, 'null'],
  ])('writes %s to stderr with an error prefix', (error, message) => {
    logError(error);

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      `${chalkStderr.red('✖')} ${message}`,
    );
  });
});
