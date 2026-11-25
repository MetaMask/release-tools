import { Configuration, Project, structUtils } from '@yarnpkg/core';
import { npath, ppath } from '@yarnpkg/fslib';

export type WorkspacePackage = {
  name: string;
  location: string;
  isPrivate: boolean;
};

/**
 * Reads named Yarn workspaces, including their repository-relative locations
 * and privacy status.
 *
 * @param projectDirectory - The repository root directory.
 * @returns The workspace packages.
 */
export async function getWorkspacePackages(
  projectDirectory: string,
): Promise<WorkspacePackage[]> {
  const portableDirectory = npath.toPortablePath(projectDirectory);
  // Workspace discovery does not need plugin-specific or newer settings.
  const configuration = await Configuration.find(portableDirectory, null, {
    strict: false,
  });
  const { project } = await Project.find(configuration, portableDirectory);
  const workspaces: WorkspacePackage[] = [];

  for (const workspace of project.workspaces) {
    if (workspace.manifest.name !== null) {
      const relativeLocation = ppath.relative(project.cwd, workspace.cwd);
      workspaces.push({
        name: structUtils.stringifyIdent(workspace.manifest.name),
        location: relativeLocation === '' ? '.' : relativeLocation,
        isPrivate: Boolean(workspace.manifest.private),
      });
    }
  }

  return workspaces;
}

/**
 * Reads named Yarn workspaces, including private packages and the root package.
 *
 * @param projectDirectory - The repository root directory.
 * @returns The workspace package names.
 */
export async function getWorkspacePackageNames(
  projectDirectory: string,
): Promise<ReadonlySet<string>> {
  const workspaces = await getWorkspacePackages(projectDirectory);
  return new Set(workspaces.map(({ name }) => name));
}
