import chalk from 'chalk';
import createSpinner from 'ora';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArgumentsCamelCase } from 'yargs';

import { checkChangedPackages } from '../../check-changed-packages.js';
import { getWorkspacePackages } from '../../workspace-package-names.js';
import { checkPackages } from './check-packages.js';

vi.mock('../../workspace-package-names.js', () => ({
  getWorkspacePackages: vi.fn(),
}));
vi.mock('../../check-changed-packages.js', () => ({
  checkChangedPackages: vi.fn(),
}));
const spinner = vi.hoisted(() => ({
  start: vi.fn(),
  succeed: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('ora', () => ({ default: vi.fn(() => spinner) }));

const originalExitCode = process.exitCode;
const WORKSPACES = [
  { name: '@metamask/root', location: '.', isPrivate: true },
  { name: '@metamask/example', location: 'packages/example', isPrivate: false },
];

function createArgs(since?: string): ArgumentsCamelCase<{ since?: unknown }> {
  return {
    _: ['check-packages'],
    $0: 'changesets-lint',
    ...(since === undefined ? {} : { since }),
  };
}

describe('check-packages command handler', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.mocked(getWorkspacePackages).mockResolvedValue(WORKSPACES);
    vi.mocked(checkChangedPackages).mockResolvedValue([]);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('checks all changed packages since the configured ref', async () => {
    await checkPackages(createArgs('merge-base-sha'));

    expect(getWorkspacePackages).toHaveBeenCalledExactlyOnceWith('/repo');
    expect(checkChangedPackages).toHaveBeenCalledExactlyOnceWith({
      repositoryDirectory: '/repo',
      since: 'merge-base-sha',
      workspaces: WORKSPACES,
    });
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('shows progress on stdout and reports success', async () => {
    await checkPackages(createArgs());

    expect(createSpinner).toHaveBeenCalledExactlyOnceWith({
      stream: process.stdout,
    });
    expect(spinner.start).toHaveBeenCalledTimes(2);
    expect(spinner.start).toHaveBeenNthCalledWith(
      1,
      chalk.dim('Discovering workspace packages.'),
    );
    expect(spinner.start).toHaveBeenNthCalledWith(
      2,
      chalk.dim('Checking changed packages.'),
    );
    expect(spinner.succeed).toHaveBeenCalledExactlyOnceWith('Done!');
    expect(spinner.stop).toHaveBeenCalledExactlyOnceWith();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('writes every formatted diagnostic to stdout and sets status 1', async () => {
    vi.mocked(checkChangedPackages).mockResolvedValue([
      {
        rule: 'missing-changeset',
        packageName: '@metamask/example',
        message:
          'The package @metamask/example changed without a matching Changeset.',
        hint: 'Run `yarn changeset` to add a Changeset for this package.',
      },
    ]);

    await checkPackages(createArgs());

    expect(vi.mocked(console.log).mock.calls).toStrictEqual([
      [
        `${chalk.red('✖')} The package @metamask/example changed without a matching Changeset. (Fix: Run \`yarn changeset\` to add a Changeset for this package.)`,
      ],
    ]);
    expect(spinner.stop).toHaveBeenCalledExactlyOnceWith();
    expect(spinner.stop).toHaveBeenCalledBefore(vi.mocked(console.log));
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('stops progress and propagates workspace discovery failures without running check', async () => {
    const error = new Error('Invalid Yarn configuration');
    vi.mocked(getWorkspacePackages).mockRejectedValue(error);

    await expect(checkPackages(createArgs())).rejects.toBe(error);

    expect(spinner.stop).toHaveBeenCalled();
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(checkChangedPackages).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('stops progress and propagates check errors without printing diagnostics', async () => {
    const error = new Error('Could not find merge base.');
    vi.mocked(checkChangedPackages).mockRejectedValue(error);

    await expect(checkPackages(createArgs())).rejects.toBe(error);

    expect(spinner.stop).toHaveBeenCalled();
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
