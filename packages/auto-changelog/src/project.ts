import { Configuration, Project } from '@yarnpkg/core';
import { npath, ppath } from '@yarnpkg/fslib';

/**
 * Read the Yarn project to find the repository root and the root directory of
 * each non-root workspace.
 *
 * @param cwd - A directory within the Yarn project.
 * @returns The repository root and the (sorted) workspace package roots.
 */
export async function getProjectRoots(
  cwd: string,
): Promise<{ repoRoot: string; packageRoots: string[] }> {
  const portableCwd = npath.toPortablePath(cwd);

  // Workspace discovery does not need plugin-specific settings. `@yarnpkg/core`
  // is outdated, and with `strict: true` it fails on newer configuration
  // settings.
  const configuration = await Configuration.find(portableCwd, null, {
    strict: false,
  });

  const { project } = await Project.find(configuration, portableCwd);

  const packageRoots = project.workspaces
    .filter((workspace) => workspace.cwd !== project.cwd)
    .map((workspace) => npath.fromPortablePath(ppath.resolve(workspace.cwd)))
    .sort();

  return { repoRoot: npath.fromPortablePath(project.cwd), packageRoots };
}
