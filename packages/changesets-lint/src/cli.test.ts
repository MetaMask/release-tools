import { chalkStderr } from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cli } from './cli.js';
import commands from './commands/index.js';

// Yargs captures process.exit when its ESM module loads.
const exit = vi.hoisted(() => vi.spyOn(process, 'exit'));
const argv = ['/node', '/bin/changesets-lint'];
const handler = vi.fn<() => Promise<void>>();
const mockedCommands = commands.map((command) => ({ ...command, handler }));

describe('cli', () => {
  beforeEach(() => {
    exit.mockReturnValue(undefined as never);
    vi.spyOn(process, 'exit').mockImplementation(exit);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    handler.mockResolvedValue(undefined);
  });

  it('runs the default command from raw Node arguments', async () => {
    await cli(argv, mockedCommands);

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ _: [], $0: 'changesets-lint' }),
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([
    ['--unknown', 'unknown'],
    ['-h', 'h'],
  ])('reports the unsupported option %s and exits', async (argument, name) => {
    const exitError = new Error('Process exited');
    exit.mockImplementation(() => {
      throw exitError;
    });

    await expect(cli([...argv, argument], mockedCommands)).rejects.toBe(
      exitError,
    );

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      `${chalkStderr.red('✖')} Unknown argument: ${name}`,
    );
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['--help', /Validate all Changeset files in the current Yarn workspace\./u],
    ['--version', /^\d+\.\d+\.\d+$/u],
  ])('prints %s without running the command', async (argument, output) => {
    await cli([...argv, argument], mockedCommands);

    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(output),
    );
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    new Error('Could not lint Changeset files.'),
    'Could not lint Changeset files.',
  ])('reports an asynchronous command failure and exits: %s', async (error) => {
    handler.mockRejectedValue(error);

    await expect(cli(argv, mockedCommands)).rejects.toBe(error);

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      `${chalkStderr.red('✖')} Could not lint Changeset files.`,
    );
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('propagates synchronous command failures to the top-level error handler', async () => {
    const error = new Error('Could not run the command.');
    handler.mockImplementation(() => {
      throw error;
    });

    await expect(cli(argv, mockedCommands)).rejects.toBe(error);

    expect(console.error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
