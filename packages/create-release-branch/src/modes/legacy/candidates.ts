import type { Candidate } from '../../core/candidates.js';
import { findWorkspaceDependentNamesOfType } from '../../core/release-rules.js';
import type { ReleaseChoices } from '../../core/release-rules.js';
import type { Project } from '../../project/project.js';

/**
 * Lists the workspace packages that the maintainer can choose to release: the
 * packages that have changes since their latest release and, given the
 * release choices, the direct and peer dependents of every package that is
 * being released with a major version bump.
 *
 * @param project - Information about the whole project.
 * @param choices - The release choices.
 * @returns The candidates, in the order of the workspace packages.
 */
export function listLegacyCandidates(
  project: Project,
  choices: ReleaseChoices = {},
): Candidate[] {
  const majorBumpNames = Object.keys(choices).filter(
    (packageName) => choices[packageName] === 'major',
  );

  const requiredDependentNames = new Set(
    majorBumpNames.flatMap((packageName) => [
      ...findWorkspaceDependentNamesOfType(
        project,
        packageName,
        'dependencies',
      ),
      ...findWorkspaceDependentNamesOfType(
        project,
        packageName,
        'peerDependencies',
      ),
    ]),
  );

  return Object.values(project.workspacePackages).flatMap<Candidate>((pkg) => {
    const { name, version } = pkg.validatedManifest;

    if (pkg.hasChangesSinceLatestRelease) {
      return [{ name, currentVersion: version.version, kind: 'changes' }];
    }

    if (requiredDependentNames.has(name)) {
      return [{ name, currentVersion: version.version, kind: 'dependency' }];
    }

    return [];
  });
}
