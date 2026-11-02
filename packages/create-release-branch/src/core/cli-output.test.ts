import { Chalk } from 'chalk';
import ora from 'ora';
import { MockWritable } from 'stdio-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CliOutput } from './cli-output.js';
import { createCliOutput } from './cli-output.js';

const spinner = vi.hoisted(() => ({
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('ora', () => ({ default: vi.fn(() => spinner) }));

const colors = new Chalk({ level: 1 });

/**
 * Sends one message through each method of the output, and runs one step.
 *
 * @param output - The output.
 */
async function writeEveryKindOfMessage(output: CliOutput): Promise<void> {
  output.info('Some info\n');
  output.success('\nSome success\n');
  output.warn('Some warning\n');
  output.error('Some error\n');
  await output.step('Doing something', async () => undefined);
}

describe('cli-output', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

    it('writes the same bytes as plain output when not a TTY', async () => {
      const plainStdout = new MockWritable();
      const plainStderr = new MockWritable();
      const stdout = new MockWritable();
      const stderr = new MockWritable();

      await writeEveryKindOfMessage(
        createCliOutput({
          stdout: plainStdout,
          stderr: plainStderr,
          styled: false,
        }),
      );
      await writeEveryKindOfMessage(createCliOutput({ stdout, stderr }));

      expect(stdout.data()).toStrictEqual(plainStdout.data());
      expect(stderr.data()).toStrictEqual(plainStderr.data());
      expect(ora).not.toHaveBeenCalled();
    });

    it('writes the same bytes as plain output when NO_COLOR is set', async () => {
      vi.stubEnv('NO_COLOR', '1');
      const plainStdout = new MockWritable();
      const plainStderr = new MockWritable();
      const stdout = Object.assign(new MockWritable(), { isTTY: true });
      const stderr = new MockWritable();

      await writeEveryKindOfMessage(
        createCliOutput({
          stdout: plainStdout,
          stderr: plainStderr,
          styled: false,
        }),
      );
      await writeEveryKindOfMessage(createCliOutput({ stdout, stderr }));

      expect(stdout.data()).toStrictEqual(plainStdout.data());
      expect(stderr.data()).toStrictEqual(plainStderr.data());
      expect(ora).not.toHaveBeenCalled();
    });

    it('colors success, warn, and error when styled', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr, styled: true });

      output.info('Some info');
      output.success('Some success');
      output.warn('Some warning');
      output.error('Some error');

      expect(stdout.data()).toStrictEqual([
        'Some info',
        colors.green('Some success'),
      ]);
      expect(stderr.data()).toStrictEqual([
        colors.yellow('Some warning'),
        colors.red('Some error'),
      ]);
    });

    it('keeps surrounding newlines outside the color codes', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr, styled: true });

      output.success('Some success\n');
      output.error('\nSome error\n\n');
      output.warn('\n');

      expect(stdout.data()).toStrictEqual([
        `${colors.green('Some success')}\n`,
      ]);
      expect(stderr.data()).toStrictEqual([
        `\n${colors.red('Some error')}\n\n`,
        '\n',
      ]);
    });

    it('step shows a spinner and marks success', async () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr, styled: true });

      const result = await output.step('Doing something', async () => 42);

      expect(result).toBe(42);
      expect(ora).toHaveBeenCalledWith({
        text: 'Doing something',
        stream: stderr,
      });
      expect(spinner.start).toHaveBeenCalledTimes(1);
      expect(spinner.succeed).toHaveBeenCalledTimes(1);
      expect(spinner.fail).not.toHaveBeenCalled();
    });

    it('step marks failure and rethrows', async () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr, styled: true });

      await expect(
        output.step('Doing something', async () => {
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');
      expect(spinner.start).toHaveBeenCalledTimes(1);
      expect(spinner.fail).toHaveBeenCalledTimes(1);
      expect(spinner.succeed).not.toHaveBeenCalled();
    });
  });
});
