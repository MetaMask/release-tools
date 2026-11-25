import { format } from 'util';

import {
  getTagNames,
  hasChangesInDirectorySinceGitTag,
} from '../../core/repo.js';
import type { Project } from '../../project/project.js';

/**
 * The workspace packages that changed since their latest release, and the ones
 * whose changes were compared against the root package tag.
 *
 * @property changedPackageNames - The names of workspace packages that changed
 * since their latest release.
 * @property packagesUsingRootTag - The names of workspace packages that had no
 * tag for their current version, in workspace order.
 */
export type LegacyPackageChanges = {
  changedPackageNames: ReadonlySet<string>;
  packagesUsingRootTag: string[];
};

/**
 * Checks the Git tags of the project and determines which workspace packages
 * have changed since their latest release.
 *
 * @param project - Information about the whole project.
 * @returns The changed workspace package names and the packages compared
 * against the root tag.
 * @throws If the project has Git tags, and the root package has no tag for its
 * current version.
 */
export async function findLegacyPackageChanges(
  project: Project,
): Promise<LegacyPackageChanges> {
  const tagNames = await getTagNames(project.directoryPath);
  const rootName = project.rootPackage.validatedManifest.name;
  const rootVersion = project.rootPackage.validatedManifest.version;
  const rootTagName = `v${rootVersion.toString()}`;
  const hasRootTag = tagNames.includes(rootTagName);

  if (tagNames.length > 0 && !hasRootTag) {
    throw new Error(
      format(
        'The package %s has no Git tag for its current version %s (expected %s), so this tool is unable to determine whether it should be included in this release. You will need to create a tag for this package in order to proceed.',
        rootName,
        rootVersion,
        `"${rootTagName}"`,
      ),
    );
  }

  const results = await Promise.all(
    Object.values(project.workspacePackages).map(async (pkg) => {
      const { name, version } = pkg.validatedManifest;
      const expectedWorkspaceTag = `${name}@${version.toString()}`;
      const hasWorkspaceTag = tagNames.includes(expectedWorkspaceTag);

      let matchingTag: string | undefined;
      if (hasWorkspaceTag) {
        matchingTag = expectedWorkspaceTag;
      } else if (hasRootTag) {
        matchingTag = rootTagName;
      }

      const usesRootTag = !hasWorkspaceTag && hasRootTag;
      const hasChanges =
        matchingTag === undefined
          ? true
          : await hasChangesInDirectorySinceGitTag(
              project.directoryPath,
              pkg.directoryPath,
              matchingTag,
            );

      return { name, usesRootTag, hasChanges };
    }),
  );

  const changedPackageNames = new Set(
    results.filter(({ hasChanges }) => hasChanges).map(({ name }) => name),
  );
  const packagesUsingRootTag = results
    .filter(({ usesRootTag }) => usesRootTag)
    .map(({ name }) => name);

  return { changedPackageNames, packagesUsingRootTag };
}
