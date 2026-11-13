import { describe, expect, it, vi } from 'vitest';

import {
  buildMockChangesetsState,
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import type { Candidate } from '../../core/candidates.js';
import type { ModePlan, ModePlanResult } from '../../core/mode.js';
import { readFile } from '../../utils/fs.js';
import { applyChangesetsRelease, checkChangesetDirectory } from './apply.js';
import { listChangesetsCandidates } from './candidates.js';
import { createChangesetsMode } from './changesets-mode.js';
import { loadChangesets } from './load.js';
import { planChangesetsRelease } from './plan.js';
import type { ChangesetsPlanData } from './plan.js';

vi.mock('../../utils/fs');
vi.mock('./apply');
vi.mock('./candidates');
vi.mock('./load');
vi.mock('./plan');

const PROJECT = buildMockProject({
  isMonorepo: true,
  workspacePackages: {
    a: buildMockPackage('a', '1.0.0'),
  },
});

const STATE = buildMockChangesetsState();

const CANDIDATES: Candidate[] = [
  {
    name: 'a',
    currentVersion: '1.0.0',
    plannedVersion: '1.1.0',
    kind: 'changes',
    changeCount: 1,
  },
];

const PLAN: ModePlan<ChangesetsPlanData> = {
  releases: [{ name: 'a', newVersion: '1.1.0' }],
  data: {
    state: STATE,
    filteredPlan: STATE.fullPlan,
    selectedChangesets: [],
  },
};

/**
 * Mocks the Changesets state of the project and its candidates.
 */
function mockState(): void {
  vi.when(vi.mocked(loadChangesets))
    .calledWith(PROJECT.directoryPath)
    .thenResolve(STATE);
  vi.when(vi.mocked(listChangesetsCandidates))
    .calledWith(PROJECT, STATE)
    .thenReturn(CANDIDATES);
}

describe('changesets-mode', () => {
  describe('createChangesetsMode', () => {
    it('is named "changesets"', () => {
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(mode.name).toBe('changesets');
    });

    it('checks the .changeset directory when it prepares the release, and returns no notice', async () => {
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(mode.prepare).toMatchObject({
        title: 'Checking the .changeset directory',
        result: 'The .changeset directory has no uncommitted changes',
      });
      expect(await mode.prepare.run()).toStrictEqual([]);
      expect(checkChangesetDirectory).toHaveBeenCalledWith(PROJECT);
    });

    it('lists the candidates of the pending Changesets', async () => {
      mockState();
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(await mode.listCandidates()).toStrictEqual(CANDIDATES);
    });

    it('ignores the choices when it lists the candidates', async () => {
      mockState();
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(await mode.listCandidates({ a: 'major' })).toStrictEqual(
        CANDIDATES,
      );
    });

    it('reads the Changesets again every time it lists the candidates', async () => {
      mockState();
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      await mode.listCandidates();
      await mode.listCandidates();

      expect(loadChangesets).toHaveBeenCalledTimes(2);
    });

    it('plans the release from the choices, with the Changesets that it reads if it did not list the candidates', async () => {
      mockState();
      const result: ModePlanResult<ChangesetsPlanData> = { plan: PLAN };
      vi.when(vi.mocked(planChangesetsRelease))
        .calledWith({
          project: PROJECT,
          state: STATE,
          candidates: CANDIDATES,
          choices: { a: 'minor' },
        })
        .thenReturn(result);
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(await mode.plan({ a: 'minor' })).toBe(result);
      expect(loadChangesets).toHaveBeenCalledTimes(1);
    });

    it('plans the release with the Changesets that the last candidates call read', async () => {
      const oldState = buildMockChangesetsState({
        fullPlan: {
          changesets: [{ id: 'old-changeset', summary: '', releases: [] }],
          releases: [],
          preState: undefined,
        },
      });
      vi.mocked(loadChangesets)
        .mockResolvedValueOnce(oldState)
        .mockResolvedValueOnce(STATE);
      vi.when(vi.mocked(listChangesetsCandidates))
        .calledWith(PROJECT, STATE)
        .thenReturn(CANDIDATES);
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      await mode.listCandidates();
      await mode.listCandidates();
      await mode.plan({ a: 'minor' });

      expect(loadChangesets).toHaveBeenCalledTimes(2);
      expect(planChangesetsRelease).toHaveBeenCalledWith({
        project: PROJECT,
        state: STATE,
        candidates: CANDIDATES,
        choices: { a: 'minor' },
      });
    });

    it('applies the planned release, and returns no notice', async () => {
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(await mode.apply(PLAN, '2.0.0')).toStrictEqual([]);
      expect(applyChangesetsRelease).toHaveBeenCalledWith({
        project: PROJECT,
        data: PLAN.data,
        newRootVersion: '2.0.0',
        formatter: 'prettier',
      });
    });

    it('returns the changelog of a package as its release notes', async () => {
      vi.when(vi.mocked(readFile))
        .calledWith(PROJECT.workspacePackages.a.changelogPath)
        .thenResolve('changelog of a');
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(await mode.getReleaseNotes('a')).toBe('changelog of a');
    });
  });
});
