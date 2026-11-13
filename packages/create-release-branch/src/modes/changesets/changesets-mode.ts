import type { Candidate } from '../../core/candidates.js';
import type { Mode } from '../../core/mode.js';
import type { Formatter } from '../../core/types.js';
import type { Project } from '../../project/project.js';
import { readFile } from '../../utils/fs.js';
import { applyChangesetsRelease, checkChangesetDirectory } from './apply.js';
import { listChangesetsCandidates } from './candidates.js';
import { loadChangesets } from './load.js';
import type { ChangesetsState } from './load.js';
import { planChangesetsRelease } from './plan.js';
import type { ChangesetsPlanData } from './plan.js';

/**
 * The Changesets state of the project, and the candidates that it gives.
 */
type LoadedChangesets = {
  state: ChangesetsState;
  candidates: Candidate[];
};

/**
 * Creates the release mode in which the pending Changesets set the packages
 * and versions to release. The maintainer only chooses which packages go in
 * the release. Before the first commit of the release, the mode checks that
 * the `.changeset` directory has no uncommitted changes, so that this commit
 * does not take in a Changeset by mistake. Every call to `listCandidates`
 * reads the Changesets again.
 * `plan` uses the Changesets that the last `listCandidates` call read, and
 * reads them only if there was no such call.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @returns The Changesets mode.
 */
export function createChangesetsMode({
  project,
  formatter,
}: {
  project: Project;
  formatter: Formatter;
}): Mode<ChangesetsPlanData> {
  let lastLoad: LoadedChangesets | undefined;

  const load = async (): Promise<LoadedChangesets> => {
    const state = await loadChangesets(project.directoryPath);
    lastLoad = { state, candidates: listChangesetsCandidates(project, state) };
    return lastLoad;
  };

  return {
    name: 'changesets',

    prepare: {
      title: 'Checking the .changeset directory',
      result: 'The .changeset directory has no uncommitted changes',
      run: async () => {
        await checkChangesetDirectory(project);
        return [];
      },
    },

    async listCandidates() {
      const { candidates } = await load();
      return candidates;
    },

    async plan(choices) {
      const { state, candidates } = lastLoad ?? (await load());
      return planChangesetsRelease({ project, state, candidates, choices });
    },

    async apply({ data }, newRootVersion) {
      await applyChangesetsRelease({
        project,
        data,
        newRootVersion,
        formatter,
      });
      return [];
    },

    async getReleaseNotes(packageName) {
      return await readFile(
        project.workspacePackages[packageName].changelogPath,
      );
    },
  };
}
