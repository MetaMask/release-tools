import type { CliOutput } from '../../core/cli-output.js';
import type { Mode } from '../../core/mode.js';
import { normalizeReleaseChoices } from '../../core/release-rules.js';
import type { Formatter, VersionSpecifiers } from '../../core/types.js';
import type { Package } from '../../project/package.js';
import {
  restoreChangelogsForSkippedPackages,
  updateChangelogsForChangedPackages,
} from '../../project/project.js';
import type { Project } from '../../project/project.js';
import { readFile } from '../../utils/fs.js';
import { listLegacyCandidates } from './candidates.js';
import {
  executeReleasePlan,
  planRelease,
  planWorkspacePackageReleases,
} from './release-plan.js';

/**
 * Creates the release mode in which the maintainer picks a version specifier
 * for each changed workspace package, and changelogs are updated from the
 * commit history.
 *
 * The plan data is the version specifier for each package to release. The
 * release plan itself is built when the plan is applied, because it needs the
 * new release version for the root package.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.defaultBranch - The name of the default branch in the repository.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @param args.output - Where to write user-facing messages.
 * @returns The legacy mode.
 */
export function createLegacyMode({
  project,
  defaultBranch,
  formatter,
  output,
}: {
  project: Project;
  defaultBranch: string;
  formatter: Formatter;
  output: CliOutput;
}): Mode<VersionSpecifiers> {
  return {
    name: 'legacy',
    // Changelogs may already be up to date, in which case there is nothing to
    // commit.
    allowEmptyInitializeCommit: true,

    async prepare() {
      await updateChangelogsForChangedPackages({ project, formatter, output });
    },

    async listCandidates(choices) {
      return listLegacyCandidates(project, choices);
    },

    async plan(choices) {
      const releaseSpecificationPackages = normalizeReleaseChoices(choices);
      const releases = planWorkspacePackageReleases({
        project,
        releaseSpecificationPackages,
      }).map(({ package: pkg, newVersion }) => ({
        name: pkg.validatedManifest.name,
        newVersion,
      }));

      return { plan: { releases, data: releaseSpecificationPackages } };
    },

    async apply({ data: releaseSpecificationPackages }, newRootVersion) {
      await restoreChangelogsForSkippedPackages({
        project,
        releaseSpecificationPackages,
        defaultBranch,
      });

      const releasePlan = await planRelease({
        project,
        releaseSpecificationPackages,
        newReleaseVersion: newRootVersion,
      });
      await executeReleasePlan(project, releasePlan, formatter, output);
    },

    async getReleaseNotes(packageName) {
      const selectedPackage = Object.values(project.workspacePackages).find(
        (pkg) => pkg.validatedManifest.name === packageName,
      ) as Package;

      return await readFile(selectedPackage.changelogPath);
    },
  };
}
