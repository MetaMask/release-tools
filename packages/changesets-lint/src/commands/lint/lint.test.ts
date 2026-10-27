import chalk from 'chalk';
import createSpinner from 'ora';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lintChangesets } from '../../lint-changesets.js';
import { getWorkspacePackageNames } from '../../workspace-package-names.js';
import { lint } from './lint.js';

vi.mock('../../workspace-package-names.js', () => ({
  getWorkspacePackageNames: vi.fn(),
}));
vi.mock('../../lint-changesets.js', () => ({ lintChangesets: vi.fn() }));
const spinner = vi.hoisted(() => ({
  start: vi.fn(),
  succeed: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('ora', () => ({ default: vi.fn(() => spinner) }));

const originalExitCode = process.exitCode;

describe('lint command handler', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.mocked(getWorkspacePackageNames).mockResolvedValue(
      new Set(['@metamask/root', '@metamask/private']),
    );
    vi.mocked(lintChangesets).mockResolvedValue([]);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('validates all Changesets with discovered workspace names', async () => {
    await lint();

    expect(getWorkspacePackageNames).toHaveBeenCalledExactlyOnceWith('/repo');
    expect(lintChangesets).toHaveBeenCalledExactlyOnceWith({
      repositoryDirectory: '/repo',
      workspacePackageNames: new Set(['@metamask/root', '@metamask/private']),
    });
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('shows progress on stdout and reports success', async () => {
    await lint();

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
      chalk.dim('Validating Changeset files.'),
    );
    expect(spinner.succeed).toHaveBeenCalledExactlyOnceWith('Done!');
    expect(spinner.stop).toHaveBeenCalledExactlyOnceWith();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('writes every formatted diagnostic to stdout in order and sets status 1', async () => {
    vi.mocked(lintChangesets).mockResolvedValue([
      {
        path: '.changeset/alpha.md',
        line: 6,
        message: 'Unsupported category.',
        hint: 'Use Added or Fixed.',
      },
      {
        path: '.changeset/zebra.md',
        line: 2,
        message: 'Unknown package.',
      },
    ]);

    await lint();

    expect(vi.mocked(console.log).mock.calls).toStrictEqual([
      [
        `${chalk.red('✖')} .changeset/alpha.md:6: Unsupported category. (Fix: Use Added or Fixed.)`,
      ],
      [`${chalk.red('✖')} .changeset/zebra.md:2: Unknown package.`],
    ]);
    expect(spinner.stop).toHaveBeenCalledExactlyOnceWith();
    expect(spinner.stop).toHaveBeenCalledBefore(vi.mocked(console.log));
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('stops progress and propagates workspace discovery failures without running lint', async () => {
    const error = new Error('Invalid Yarn configuration');
    vi.mocked(getWorkspacePackageNames).mockRejectedValue(error);

    await expect(lint()).rejects.toBe(error);

    expect(spinner.stop).toHaveBeenCalled();
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(lintChangesets).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('stops progress and propagates repository read errors without printing diagnostics', async () => {
    const error = new Error('Could not find the Changeset directory in /repo.');
    vi.mocked(lintChangesets).mockRejectedValue(error);

    await expect(lint()).rejects.toBe(error);

    expect(spinner.stop).toHaveBeenCalled();
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
