import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getChangesetPaths } from './changeset-paths.js';
import type { LintDiagnostic } from './diagnostics.js';
import { validateChangesetFile } from './validate-changeset-file.js';

export type LintChangesetsOptions = {
  repositoryDirectory: string;
  workspacePackageNames: ReadonlySet<string>;
};

/**
 * Selects and validates Changeset files in a repository.
 *
 * @param options - The repository and validation options.
 * @param options.repositoryDirectory - The repository directory.
 * @param options.workspacePackageNames - The valid workspace package names.
 * @returns Diagnostics for all selected Changeset files.
 */
export async function lintChangesets({
  repositoryDirectory,
  workspacePackageNames,
}: LintChangesetsOptions): Promise<LintDiagnostic[]> {
  const selectedPaths = await getChangesetPaths(repositoryDirectory);
  const diagnostics: LintDiagnostic[] = [];

  for (const filePath of selectedPaths.sort()) {
    let contents: string;
    try {
      contents = await readFile(
        path.join(repositoryDirectory, filePath),
        'utf8',
      );
    } catch (error) {
      throw new Error(`Could not read Changeset file ${filePath}.`, {
        cause: error,
      });
    }
    diagnostics.push(
      ...validateChangesetFile({
        path: filePath,
        contents,
        workspacePackageNames,
      }).map((diagnostic) => ({ ...diagnostic, path: filePath })),
    );
  }

  return diagnostics;
}
