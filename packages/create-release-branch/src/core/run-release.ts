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
  if (context.project.isMonorepo) {
    context.output.info(
      'Project appears to have workspaces. Following monorepo workflow.\n',
    );
    await frontEnd.run(context);
  } else {
    context.output.info(
      'Project does not appear to have any workspaces. Following polyrepo workflow.\n',
    );
  }
}
