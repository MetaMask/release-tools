import {
  S_BAR,
  S_BAR_END,
  S_BAR_START,
  S_ERROR,
  S_INFO,
  S_STEP_SUBMIT,
  S_SUCCESS,
  S_WARN,
  spinner,
  taskLog,
} from '@clack/prompts';
import { stripVTControlCharacters, styleText } from 'node:util';
import { MockWritable } from 'stdio-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliOutput } from './cli-output.js';
import { createCliOutput } from './cli-output.js';

const indicators = vi.hoisted(() => ({
  spinner: { start: vi.fn(), stop: vi.fn(), error: vi.fn() },
  taskLog: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clack/prompts')>()),
  spinner: vi.fn(() => indicators.spinner),
  taskLog: vi.fn(() => indicators.taskLog),
}));

/**
 * Builds a mock stream that reports being a color terminal with a width.
 *
 * @returns The mock stream.
 */
function buildTerminalStream(): MockWritable & {
  isTTY: boolean;
  columns: number;
  hasColors: () => boolean;
} {
  return Object.assign(new MockWritable(), {
    isTTY: true,
    columns: 80,
    hasColors: () => true,
  });
}

/**
 * Builds the text that clack writes for one log message: a gutter line, then
 * the symbol and the message.
 *
 * @param symbol - The symbol in front of the message.
 * @param message - The message.
 * @returns The text, without colors.
 */
function logLine(symbol: string, message: string): string {
  return `${S_BAR}\n${symbol}  ${message}\n`;
}

/**
 * Gets everything that was written to a stream, as one string.
 *
 * @param stream - The stream.
 * @returns The text.
 */
function textOf(stream: MockWritable): string {
  return stream.data().join('');
}

/**
 * Sends one message through each method of the output, runs one step, and
 * runs one task that fails after printing a line.
 *
 * @param output - The output.
 */
async function writeEveryKindOfMessage(output: CliOutput): Promise<void> {
  output.info('Some info\n');
  output.success('Some success\n');
  output.warn('Some warning\n');
  output.error('Some error\n');
  await output.step('Doing something', async () => undefined);
  await expect(
    output.task('Running something', async (log) => {
      log('Some line');
      throw new Error('oops');
    }),
  ).rejects.toThrow('oops');
}

describe('cli-output', () => {
  beforeEach(() => {
    // Make clack color its symbols, whatever the terminal running the tests.
    vi.stubEnv('FORCE_COLOR', '1');
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('CI', undefined);
    vi.stubEnv('TERM', 'xterm-256color');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('createCliOutput', () => {
    it('writes info and success through clack to stdout', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.info('Some info\n');
      output.success('Some success');

      expect(textOf(stdout)).toBe(
        `${logLine(S_INFO, 'Some info')}${logLine(S_SUCCESS, 'Some success')}`,
      );
      expect(stderr.data()).toStrictEqual([]);
    });

    it('writes warnings and errors to stderr', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.warn('Some warning\n\n');
      output.error('Some error');

      expect(textOf(stderr)).toBe(
        `${logLine(S_WARN, 'Some warning')}${logLine(S_ERROR, 'Some error')}`,
      );
      expect(stdout.data()).toStrictEqual([]);
    });

    it('warnList writes the title and indented items to stderr', () => {
      const stdout = new MockWritable();
      const plainStderr = new MockWritable();
      const styledStderr = buildTerminalStream();

      createCliOutput({ stdout, stderr: plainStderr }).warnList('Some title:', [
        'a',
        'b',
      ]);
      createCliOutput({ stdout, stderr: styledStderr }).warnList(
        'Some title:',
        ['a'],
      );

      expect(textOf(plainStderr)).toBe(
        `${logLine(S_WARN, 'Some title:')}${S_BAR}    a\n${S_BAR}    b\n`,
      );
      expect(textOf(styledStderr)).toContain(
        `  ${styleText('dim', 'a', { validateStream: false })}`,
      );
      expect(stdout.data()).toStrictEqual([]);
    });

    it('warnList indents every line of a multi-line item', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();

      createCliOutput({ stdout, stderr }).warnList('Some title:', [
        'Line 1\nLine 2',
      ]);

      expect(textOf(stderr)).toBe(
        `${logLine(S_WARN, 'Some title:')}${S_BAR}    Line 1\n${S_BAR}    Line 2\n`,
      );
    });

    it('writes stderr without colors when only stdout is a color terminal', () => {
      const stdout = buildTerminalStream();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.success('Some success');
      output.error('Some error');

      expect(textOf(stdout)).not.toBe(stripVTControlCharacters(textOf(stdout)));
      expect(stripVTControlCharacters(textOf(stdout))).toBe(
        logLine(S_SUCCESS, 'Some success'),
      );
      expect(textOf(stderr)).toBe(logLine(S_ERROR, 'Some error'));
    });

    it.each([
      {
        condition: 'the streams are not terminals',
        buildStream: (): MockWritable => new MockWritable(),
        arrange: (): void => undefined,
      },
      {
        condition: 'NO_COLOR is set',
        buildStream: buildTerminalStream,
        arrange: (): void => {
          vi.stubEnv('FORCE_COLOR', undefined);
          vi.stubEnv('NO_COLOR', '1');
        },
      },
      {
        condition: 'the terminals have no colors',
        buildStream: (): MockWritable =>
          Object.assign(buildTerminalStream(), { hasColors: () => false }),
        arrange: (): void => undefined,
      },
      {
        condition: 'the terminals cannot tell whether they have colors',
        buildStream: (): MockWritable =>
          Object.assign(new MockWritable(), { isTTY: true, columns: 80 }),
        arrange: (): void => undefined,
      },
      {
        condition: 'the tool runs in GitHub Actions',
        buildStream: buildTerminalStream,
        arrange: (): void => {
          vi.stubEnv('CI', 'true');
          vi.stubEnv('GITHUB_ACTIONS', 'true');
        },
      },
      {
        condition: 'CI is 1',
        buildStream: buildTerminalStream,
        arrange: (): void => {
          vi.stubEnv('CI', '1');
        },
      },
    ])(
      'writes no ANSI codes when no stream is styled because $condition',
      async ({ buildStream, arrange }) => {
        arrange();
        const stdout = buildStream();
        const stderr = buildStream();

        await writeEveryKindOfMessage(createCliOutput({ stdout, stderr }));

        expect(textOf(stdout)).toBe(
          [
            logLine(S_INFO, 'Some info'),
            logLine(S_SUCCESS, 'Some success'),
            logLine(S_STEP_SUBMIT, 'Doing something'),
          ].join(''),
        );
        expect(textOf(stderr)).toBe(
          [
            logLine(S_WARN, 'Some warning'),
            logLine(S_ERROR, 'Some error'),
            logLine(S_ERROR, 'Running something'),
            logLine(S_BAR, 'Some line'),
          ].join(''),
        );
        expect(spinner).not.toHaveBeenCalled();
        expect(taskLog).not.toHaveBeenCalled();
      },
    );

    it('shows a spinner for a step when animating, and static lines otherwise', async () => {
      const stderr = buildTerminalStream();
      const animated = createCliOutput({ stdout: new MockWritable(), stderr });
      const stdout = new MockWritable();
      const plainStderr = new MockWritable();
      const plain = createCliOutput({ stdout, stderr: plainStderr });

      for (const output of [animated, plain]) {
        expect(await output.step('Doing something', async () => 42)).toBe(42);
        await expect(
          output.step('Doing something else', async () => {
            throw new Error('oops');
          }),
        ).rejects.toThrow('oops');
      }

      expect(vi.mocked(spinner).mock.calls).toStrictEqual([
        [{ output: stderr, errorMessage: 'Doing something' }],
        [{ output: stderr, errorMessage: 'Doing something else' }],
      ]);
      expect(indicators.spinner.start.mock.calls).toStrictEqual([
        ['Doing something'],
        ['Doing something else'],
      ]);
      expect(indicators.spinner.stop).toHaveBeenCalledExactlyOnceWith(
        'Doing something',
      );
      expect(indicators.spinner.error).toHaveBeenCalledExactlyOnceWith(
        'Doing something else',
      );
      expect(stderr.data()).toStrictEqual([]);
      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Doing something'));
      expect(textOf(plainStderr)).toBe(
        logLine(S_ERROR, 'Doing something else'),
      );
    });

    it.each([
      {
        condition: 'stderr reports no width',
        buildStderr: (): MockWritable =>
          Object.assign(buildTerminalStream(), { columns: 0 }),
        arrange: (): void => undefined,
      },
      {
        condition: 'TERM is dumb',
        buildStderr: buildTerminalStream,
        arrange: (): void => {
          vi.stubEnv('TERM', 'dumb');
        },
      },
    ])('shows no spinner when $condition', async ({ buildStderr, arrange }) => {
      arrange();
      const stdout = new MockWritable();
      const output = createCliOutput({ stdout, stderr: buildStderr() });

      await output.step('Doing something', async () => undefined);

      expect(spinner).not.toHaveBeenCalled();
      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Doing something'));
    });

    it.each(['', '0', 'false'])(
      'shows a spinner when CI is "%s"',
      async (value) => {
        vi.stubEnv('CI', value);
        const output = createCliOutput({
          stdout: new MockWritable(),
          stderr: buildTerminalStream(),
        });

        await output.step('Doing something', async () => undefined);

        expect(spinner).toHaveBeenCalledTimes(1);
      },
    );

    it('streams task output and clears it when the task succeeds', async () => {
      const stdout = new MockWritable();
      const stderr = buildTerminalStream();
      const output = createCliOutput({ stdout, stderr });

      const result = await output.task('Running something', async (log) => {
        log('Line 1');
        log('Line 2');
        return 42;
      });

      expect(result).toBe(42);
      expect(taskLog).toHaveBeenCalledExactlyOnceWith({
        title: 'Running something',
        limit: 10,
        retainLog: true,
        output: stderr,
      });
      expect(indicators.taskLog.message.mock.calls).toStrictEqual([
        ['Line 1'],
        ['Line 2'],
      ]);
      expect(indicators.taskLog.success).toHaveBeenCalledExactlyOnceWith(
        'Running something',
      );
      expect(indicators.taskLog.error).not.toHaveBeenCalled();
      expect(stdout.data()).toStrictEqual([]);
    });

    it('keeps the task output when the task fails', async () => {
      const output = createCliOutput({
        stdout: new MockWritable(),
        stderr: buildTerminalStream(),
      });

      await expect(
        output.task('Running something', async (log) => {
          log('Line 1');
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');

      expect(indicators.taskLog.message).toHaveBeenCalledExactlyOnceWith(
        'Line 1',
      );
      expect(indicators.taskLog.error).toHaveBeenCalledExactlyOnceWith(
        'Running something',
        { showLog: true },
      );
      expect(indicators.taskLog.success).not.toHaveBeenCalled();
    });

    it('shows only the last lines while a task runs, and every line when it fails', async () => {
      const actual =
        await vi.importActual<typeof import('@clack/prompts')>(
          '@clack/prompts',
        );
      vi.mocked(taskLog).mockImplementation(actual.taskLog);
      const stderr = buildTerminalStream();
      const output = createCliOutput({ stdout: new MockWritable(), stderr });
      const lines = Array.from(
        { length: 15 },
        (_, index) => `Line ${index + 1}`,
      );
      let writesBeforeFailure = 0;

      await expect(
        output.task('Running something', async (log) => {
          lines.forEach(log);
          writesBeforeFailure = stderr.data().length;
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');

      const lastRedraw = stripVTControlCharacters(
        stderr
          .data()
          .slice(writesBeforeFailure - 1, writesBeforeFailure)
          .join(''),
      );
      expect(lastRedraw).not.toContain('Line 5\n');
      expect(lastRedraw).toContain('Line 6\n');
      const failure = stripVTControlCharacters(
        stderr.data().slice(writesBeforeFailure).join(''),
      );
      expect(failure).toContain(`${S_ERROR}  Running something`);
      for (const line of lines) {
        expect(failure).toContain(`${S_BAR}  ${line}\n`);
      }
    });

    it('prints the task output only when it fails in plain output', async () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      const result = await output.task('Running something', async (log) => {
        log('Hidden line');
        return 42;
      });
      await expect(
        output.task('Running something else', async (log) => {
          log('Line 1');
          log('Line 2');
          throw new Error('oops');
        }),
      ).rejects.toThrow('oops');

      expect(result).toBe(42);
      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Running something'));
      expect(textOf(stderr)).toBe(
        [
          logLine(S_ERROR, 'Running something else'),
          `${S_BAR}\n${S_BAR}  Line 1\n${S_BAR}  Line 2\n`,
        ].join(''),
      );
      expect(taskLog).not.toHaveBeenCalled();
    });

    it('failure writes the title, the lines, and the cancel line to stderr', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.failure('Something failed', ['Line 1', '', 'Line 2']);

      expect(textOf(stderr)).toBe(
        [
          logLine(S_ERROR, 'Something failed'),
          `${S_BAR}\n${S_BAR}  Line 1\n${S_BAR}\n${S_BAR}  Line 2\n${S_BAR}\n`,
          `${S_BAR_END}  The release did not finish.\n\n`,
        ].join(''),
      );
      expect(stdout.data()).toStrictEqual([]);
    });

    it('failure writes a gutter line before the closing line when there are no lines', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.failure('Something failed', []);

      expect(textOf(stderr)).toBe(
        [
          logLine(S_ERROR, 'Something failed'),
          `${S_BAR}\n`,
          `${S_BAR_END}  The release did not finish.\n\n`,
        ].join(''),
      );
    });

    it('failure keeps the gutter on every line of a multi-line entry', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();
      const output = createCliOutput({ stdout, stderr });

      output.failure('Something failed', ['Line 1\nLine 2']);

      expect(textOf(stderr)).toBe(
        [
          logLine(S_ERROR, 'Something failed'),
          `${S_BAR}\n${S_BAR}  Line 1\n${S_BAR}  Line 2\n${S_BAR}\n`,
          `${S_BAR_END}  The release did not finish.\n\n`,
        ].join(''),
      );
    });

    it('header writes the intro', () => {
      const plainStdout = new MockWritable();
      const styledStdout = buildTerminalStream();
      const stderr = new MockWritable();

      createCliOutput({ stdout: plainStdout, stderr }).header(
        'Some title',
        'some details',
      );
      createCliOutput({ stdout: styledStdout, stderr }).header(
        'Some title',
        'some details',
      );

      expect(textOf(plainStdout)).toBe(
        `${S_BAR_START}  Some title  some details\n`,
      );
      expect(textOf(styledStdout)).toContain(
        `${styleText(['inverse', 'cyan'], ' Some title ', { validateStream: false })} ${styleText('dim', 'some details', { validateStream: false })}`,
      );
      expect(stderr.data()).toStrictEqual([]);
    });

    it('done writes a completed step', () => {
      const stdout = new MockWritable();
      const stderr = new MockWritable();

      createCliOutput({ stdout, stderr }).done('Did something');

      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Did something'));
      expect(stderr.data()).toStrictEqual([]);
    });

    it('summary writes the note and the outro', () => {
      const plainStdout = new MockWritable();
      const styledStdout = buildTerminalStream();
      const stderr = new MockWritable();

      createCliOutput({ stdout: plainStdout, stderr }).summary(
        'Some title',
        ['Line 1', '', 'Line 2'],
        'All done',
      );
      createCliOutput({ stdout: styledStdout, stderr }).summary(
        'Some title',
        ['Line 1'],
        'All done',
      );

      const text = textOf(plainStdout);
      expect(text).toContain(`${S_STEP_SUBMIT}  Some title `);
      expect(text).toContain(`${S_BAR}  Line 1 `);
      expect(text).toContain(`${S_BAR}  Line 2 `);
      expect(text.endsWith(`${S_BAR}\n${S_BAR_END}  All done\n\n`)).toBe(true);
      expect(textOf(styledStdout)).toContain(
        styleText('green', 'All done', { validateStream: false }),
      );
      expect(stderr.data()).toStrictEqual([]);
    });

    it('step ends with the result text', async () => {
      const stderr = buildTerminalStream();
      const animated = createCliOutput({ stdout: new MockWritable(), stderr });
      const stdout = new MockWritable();
      const plainStderr = new MockWritable();
      const plain = createCliOutput({ stdout, stderr: plainStderr });
      const options = { result: (value: number): string => `Did ${value}` };

      for (const output of [animated, plain]) {
        expect(await output.step('Doing', async () => 42, options)).toBe(42);
        await expect(
          output.step(
            'Failing',
            async () => {
              throw new Error('oops');
            },
            options,
          ),
        ).rejects.toThrow('oops');
      }

      expect(indicators.spinner.stop).toHaveBeenCalledExactlyOnceWith('Did 42');
      expect(indicators.spinner.error).toHaveBeenCalledExactlyOnceWith(
        'Failing',
      );
      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Did 42'));
      expect(textOf(plainStderr)).toBe(logLine(S_ERROR, 'Failing'));
    });

    it('task ends with the result text', async () => {
      const animated = createCliOutput({
        stdout: new MockWritable(),
        stderr: buildTerminalStream(),
      });
      const stdout = new MockWritable();
      const plain = createCliOutput({ stdout, stderr: new MockWritable() });
      const options = { result: (value: number): string => `Ran ${value}` };

      for (const output of [animated, plain]) {
        expect(await output.task('Running', async () => 42, options)).toBe(42);
      }

      expect(indicators.taskLog.success).toHaveBeenCalledExactlyOnceWith(
        'Ran 42',
      );
      expect(textOf(stdout)).toBe(logLine(S_STEP_SUBMIT, 'Ran 42'));
    });

    it('formats names and dim text for stderr only when stderr is styled', () => {
      const styled = createCliOutput({
        stdout: new MockWritable(),
        stderr: buildTerminalStream(),
      });
      const plain = createCliOutput({
        stdout: buildTerminalStream(),
        stderr: new MockWritable(),
      });

      expect(styled.format.name('a')).toBe(
        styleText('cyan', 'a', { validateStream: false }),
      );
      expect(styled.format.dim('a')).toBe(
        styleText('dim', 'a', { validateStream: false }),
      );
      expect(plain.format.name('a')).toBe('a');
      expect(plain.format.dim('a')).toBe('a');
    });

    it.each([
      { keyName: 'Ctrl+C', input: '\u0003', key: { ctrl: true, name: 'c' } },
      {
        keyName: 'Escape',
        input: '\u001b',
        key: { ctrl: false, name: 'escape' },
      },
    ])('exits with 130 on $keyName during a step', async ({ input, key }) => {
      const exit = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const output = createCliOutput({
        stdout: new MockWritable(),
        stderr: buildTerminalStream(),
      });
      const press = (): void => {
        process.stdin.emit('keypress', input, key);
      };

      await output.step('Doing something', async () => {
        process.stdin.emit('keypress', 'c', { ctrl: false, name: 'c' });
        expect(exit).not.toHaveBeenCalled();
        press();
      });
      press();

      expect(exit).toHaveBeenCalledExactlyOnceWith(130);
    });
  });
});
