import type { WriteStream } from 'fs';

import { applyChangesetsRelease } from './changesets-apply.js';
import { loadChangesetsPlan } from './changesets-plan.js';
import type { LoadedChangesetsPlan } from './changesets-plan.js';
import { planChangesetsRelease } from './changesets-release-plan.js';
import type {
  ChangesetsOverride,
  ChangesetsReleasePlan,
} from './changesets-release-plan.js';
import {
  findChangesetsCandidates,
  generateChangesetsReleaseSpecificationTemplate,
} from './changesets-release-specification.js';
import type { ChangesetsCandidate } from './changesets-release-specification.js';
import type { Formatter } from './initial-parameters.js';
import type { Project } from './project.js';
import {
  readReleaseSpecificationEntries,
  validateReleaseSpecification,
} from './release-specification.js';
import type { ReleaseSource } from './release-workflow.js';

/**
 * A release spec validated in Changesets mode.
 *
 * @property plan - The Changesets plan that the release spec was validated
 * against.
 * @property releasePlan - The release plan built from the release spec.
 */
export type ChangesetsReleaseSpecification = {
  plan: LoadedChangesetsPlan;
  releasePlan: ChangesetsReleasePlan;
};

/**
 * Describes the values of the release spec that differ from the Changesets
 * release plan.
 *
 * @param overrides - The overrides of the release plan.
 * @returns The notice, or undefined if there are no overrides.
 */
function buildOverrideNotice(
  overrides: ChangesetsOverride[],
): string | undefined {
  if (overrides.length === 0) {
    return undefined;
  }
  const lines = overrides.map(
    ({ name, plannedType, plannedVersion, versionSpecifier, newVersion }) => {
      const releasedAs =
        versionSpecifier === newVersion
          ? newVersion
          : `${versionSpecifier} (${newVersion})`;
      return `- ${name}: planned as ${plannedType} (${plannedVersion}), released as ${releasedAs}`;
    },
  );
  return [
    'The release spec overrides the Changesets release plan for these packages:',
    ...lines,
    '',
  ].join('\n');
}

/**
 * Loads the Changesets plan of a project and the packages it offers for
 * release.
 *
 * @param project - The project.
 * @returns The plan and the candidates.
 */
async function loadPlanAndCandidates(project: Project): Promise<{
  plan: LoadedChangesetsPlan;
  candidates: ChangesetsCandidate[];
}> {
  const plan = await loadChangesetsPlan(project.directoryPath);
  const candidates = await findChangesetsCandidates({ project, plan });
  return { plan, candidates };
}

/**
 * Creates the release source in which pending Changesets determine the
 * packages to release and their new versions, and the user picks which of
 * them to release. The Changesets are read again on each step, so changes
 * made to them between runs are taken into account.
 *
 * @param args - The arguments to this function.
 * @param args.project - Information about the project.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @returns The release source.
 */
export function createChangesetsReleaseSource({
  project,
  formatter,
  stderr,
}: {
  project: Project;
  formatter: Formatter;
  stderr: Pick<WriteStream, 'write'>;
}): ReleaseSource<ChangesetsReleaseSpecification> {
  return {
    allowEmptyInitializeCommit: true,

    async prepare() {
      // Nothing to prepare: changelogs are written from the Changesets.
    },

    async generateReleaseSpecificationTemplate({ isEditorAvailable }) {
      const { candidates } = await loadPlanAndCandidates(project);
      return generateChangesetsReleaseSpecificationTemplate({
        candidates,
        isEditorAvailable,
      });
    },

    async validateReleaseSpecification(releaseSpecificationPath) {
      const { plan, candidates } = await loadPlanAndCandidates(project);
      const packagesWithChanges = new Set(
        candidates
          .filter(({ kind }) => kind === 'direct' || kind === 'legacy')
          .map(({ name }) => name),
      );
      await validateReleaseSpecification(project, releaseSpecificationPath, {
        packagesWithChanges,
      });
      const entries = await readReleaseSpecificationEntries(
        releaseSpecificationPath,
      );
      const releasePlan = planChangesetsRelease({
        project,
        plan,
        candidates,
        entries,
        releaseSpecificationPath,
      });
      const overrideNotice = buildOverrideNotice(releasePlan.overrides);
      if (overrideNotice !== undefined) {
        stderr.write(overrideNotice);
      }
      return { plan, releasePlan };
    },

    async apply({
      releaseSpecification: { plan, releasePlan },
      newReleaseVersion,
    }) {
      await applyChangesetsRelease({
        project,
        plan,
        releasePlan,
        newReleaseVersion,
        formatter,
        stderr,
      });
    },
  };
}
