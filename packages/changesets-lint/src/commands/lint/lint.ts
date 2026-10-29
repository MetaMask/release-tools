import chalk from 'chalk';
import createSpinner from 'ora';

import { formatDiagnostic } from '../../diagnostics.js';
import type { LintDiagnostic } from '../../diagnostics.js';
import { lintChangesets } from '../../lint-changesets.js';
import { getWorkspacePackageNames } from '../../workspace-package-names.js';

/**
 * Validates all Changeset files in the current Yarn workspace.
 *
 * @returns A promise that resolves when linting completes.
 */
export async function lint(): Promise<void> {
  const repositoryDirectory = process.cwd();
  const spinner = createSpinner({ stream: process.stdout });
  let diagnostics: LintDiagnostic[];

  try {
    spinner.start(chalk.dim('Discovering workspace packages.'));
    const workspacePackageNames =
      await getWorkspacePackageNames(repositoryDirectory);

    spinner.start(chalk.dim('Validating Changeset files.'));
    diagnostics = await lintChangesets({
      repositoryDirectory,
      workspacePackageNames,
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
