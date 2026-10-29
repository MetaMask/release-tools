import { Configuration, Project, structUtils } from '@yarnpkg/core';
import { npath } from '@yarnpkg/fslib';

/**
 * Reads named Yarn workspaces, including private packages and the root package.
 *
 * @param projectDirectory - The repository root directory.
 * @returns The workspace package names.
 */
export async function getWorkspacePackageNames(
  projectDirectory: string,
): Promise<ReadonlySet<string>> {
  const portableDirectory = npath.toPortablePath(projectDirectory);
  // Workspace discovery does not need plugin-specific or newer settings.
  const configuration = await Configuration.find(portableDirectory, null, {
    strict: false,
  });
  const { project } = await Project.find(configuration, portableDirectory);
  const workspacePackageNames = new Set<string>();
  for (const workspace of project.workspaces) {
    if (workspace.manifest.name !== null) {
      workspacePackageNames.add(
        structUtils.stringifyIdent(workspace.manifest.name),
      );
    }
  }
  return workspacePackageNames;
}
