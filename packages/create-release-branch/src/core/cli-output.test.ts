import { MockWritable } from 'stdio-mock';
import { describe, expect, it } from 'vitest';

import { createCliOutput } from './cli-output.js';

describe('cli-output', () => {
  describe('createCliOutput', () => {
    it('writes info and success to stdout as given', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.info('Some info\n');
      output.success('Some success');

      expect(stdout.data()).toStrictEqual(['Some info\n', 'Some success']);
      expect(stderr.data()).toStrictEqual([]);
    });

    it('writes warn and error to stderr as given', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.warn('Some warning');
      output.error('Some error\n');

      expect(stderr.data()).toStrictEqual(['Some warning', 'Some error\n']);
      expect(stdout.data()).toStrictEqual([]);
    });

    it('step runs the callback, returns its result, and writes nothing', async () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      const result = await output.step('Doing something', async () => 42);

      expect(result).toBe(42);
      expect(stdout.data()).toStrictEqual([]);
      expect(stderr.data()).toStrictEqual([]);
    });

    it('step rethrows the callback error', async () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      await expect(
        output.step('Doing something', async () => {
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');
      expect(stdout.data()).toStrictEqual([]);
      expect(stderr.data()).toStrictEqual([]);
    });
  });
});
