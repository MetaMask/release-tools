import type { WriteStream } from 'fs';

import { Formatter } from './initial-parameters.js';
import {
  Project,
  updateChangelogsForChangedPackages,
  restoreChangelogsForSkippedPackages,
} from './project.js';
import { planRelease, executeReleasePlan } from './release-plan.js';
import {
  generateReleaseSpecificationTemplateForMonorepo,
  validateReleaseSpecification,
} from './release-specification.js';
import type { ReleaseSpecification } from './release-specification.js';
import type { ReleaseSource } from './release-workflow.js';

/**
 * Creates the release source in which the user picks a version specifier for
 * each changed workspace package, and changelogs are updated from the commit
 * history.
 *
 * @param args - The arguments to this function.
 * @param args.project - Information about the project.
 * @param args.defaultBranch - The name of the default branch in the repository.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @returns The release source.
 */
export function createLegacyReleaseSource({
  project,
  defaultBranch,
  formatter,
  stderr,
}: {
  project: Project;
  defaultBranch: string;
  formatter: Formatter;
  stderr: Pick<WriteStream, 'write'>;
}): ReleaseSource<ReleaseSpecification> {
  return {
    async prepare() {
      await updateChangelogsForChangedPackages({ project, formatter, stderr });
    },

    async generateReleaseSpecificationTemplate({ isEditorAvailable }) {
      return await generateReleaseSpecificationTemplateForMonorepo({
        project,
        isEditorAvailable,
      });
    },

    async validateReleaseSpecification(releaseSpecificationPath) {
      return await validateReleaseSpecification(
        project,
        releaseSpecificationPath,
      );
    },

    async apply({ releaseSpecification: { packages }, newReleaseVersion }) {
      await restoreChangelogsForSkippedPackages({
        project,
        releaseSpecificationPackages: packages,
        defaultBranch,
      });

      const releasePlan = await planRelease({
        project,
        releaseSpecificationPackages: packages,
        newReleaseVersion,
      });
      await executeReleasePlan(project, releasePlan, formatter, stderr);
    },
  };
}
