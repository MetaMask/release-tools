import chalk from 'chalk';
import createSpinner from 'ora';
import type { ArgumentsCamelCase } from 'yargs';

import { checkChangedPackages } from '../../check-changed-packages.js';
import { formatDiagnostic } from '../../diagnostics.js';
import type { LintDiagnostic } from '../../diagnostics.js';
import { getWorkspacePackages } from '../../workspace-package-names.js';

/**
 * Checks that changed non-private workspace packages have matching Changesets.
 *
 * @param args - Parsed command arguments.
 * @returns A promise that resolves when the check completes.
 */
export async function checkPackages(
  args: ArgumentsCamelCase<{ since?: unknown }>,
): Promise<void> {
  const repositoryDirectory = process.cwd();
  const since = typeof args.since === 'string' ? args.since : 'origin/main';
  const spinner = createSpinner({ stream: process.stdout });
  let diagnostics: LintDiagnostic[];

  try {
    spinner.start(chalk.dim('Discovering workspace packages.'));
    const workspaces = await getWorkspacePackages(repositoryDirectory);

    spinner.start(chalk.dim('Checking changed packages.'));
    diagnostics = await checkChangedPackages({
      repositoryDirectory,
      since,
      workspaces,
    });
  } finally {
    spinner.stop();
  }

  for (const diagnostic of diagnostics) {
    console.log(`${chalk.red('✖')} ${formatDiagnostic(diagnostic)}`);
  }
  if (diagnostics.length > 0) {
    process.exitCode = 1;
  } else {
    spinner.succeed('Done!');
  }
}
