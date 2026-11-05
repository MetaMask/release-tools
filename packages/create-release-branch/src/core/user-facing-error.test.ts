import { describe, expect, it } from 'vitest';

import type { CliOutput } from './cli-output.js';
import { describeError, UserFacingError } from './user-facing-error.js';

const format: CliOutput['format'] = {
  name: (text) => `<${text}>`,
  dim: (text) => `(${text})`,
};

class TestError extends UserFacingError {
  describe(
    errorFormat: CliOutput['format'],
  ): ReturnType<UserFacingError['describe']> {
    return { title: 'Test title', lines: [errorFormat.name('a')] };
  }
}

describe('user-facing-error', () => {
  describe('describeError', () => {
    it('uses the description of a user-facing error', () => {
      const error = new TestError('Some message', {
        cause: new Error('Some cause'),
      });

      expect(describeError(error, format, { debug: true })).toStrictEqual({
        title: 'Test title',
        lines: ['<a>'],
      });
    });

    it('prints causes and hides the stack trace', () => {
      const error = new Error('Could not read file\nmore details', {
        cause: new Error('Permission denied', { cause: 'EACCES' }),
      });

      expect(describeError(error, format, { debug: false })).toStrictEqual({
        title: 'Could not read file',
        lines: [
          'more details',
          'Caused by: Permission denied',
          'Caused by: EACCES',
        ],
      });
    });

    it('prints the stack trace when debugging is on', () => {
      const error = new Error('Something failed', {
        cause: new Error('Some cause'),
      });
      error.stack = 'Error: Something failed\n    at line 1\n    at line 2';

      expect(describeError(error, format, { debug: true })).toStrictEqual({
        title: 'Something failed',
        lines: [
          'Caused by: Some cause',
          '',
          'Error: Something failed',
          '    at line 1',
          '    at line 2',
        ],
      });
    });

    it('describes a value that is not an error', () => {
      expect(describeError('oops', format, { debug: true })).toStrictEqual({
        title: 'oops',
        lines: [],
      });
    });
  });
});
