import type { FrontEnd, ReleaseContext } from './front-end.js';

/**
 * Runs the release with the given front end if the project is a monorepo.
 * Otherwise, only says that the project is a polyrepo.
 *
 * @param context - What the front end needs to run the release.
 * @param frontEnd - The front end that collects the release choices.
 */
export async function runRelease(
  context: ReleaseContext,
  frontEnd: FrontEnd,
): Promise<void> {
  const { project, mode, output } = context;

  if (project.isMonorepo) {
    output.header(
      'create-release-branch',
      `${project.rootPackage.validatedManifest.name} · monorepo · ${mode.name} mode`,
    );

    const { packagesUsingRootTag } = project;
    if (packagesUsingRootTag.length > 0) {
      const rootTag = `v${project.rootPackage.validatedManifest.version.toString()}`;
      output.warnList(
        packagesUsingRootTag.length === 1
          ? `1 package has no tag for its current version, so changes are compared against the root tag ${rootTag}:`
          : `${packagesUsingRootTag.length} packages have no tag for their current version, so changes are compared against the root tag ${rootTag}:`,
        packagesUsingRootTag,
      );
    }

    await frontEnd.run(context);
  } else {
    output.info(
      'Project does not appear to have any workspaces. Following polyrepo workflow.\n',
    );
  }
}
