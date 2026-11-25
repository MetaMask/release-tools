import { describe, expect, it, vi } from 'vitest';

import {
  buildMockChangesetsState,
  buildMockPackage,
  buildMockProject,
} from '../../../tests/unit/helpers.js';
import type { Candidate } from '../../core/candidates.js';
import type { ModePlan, ModePlanResult } from '../../core/mode.js';
import { readFile } from '../../utils/fs.js';
import {
  applyChangesetsRelease,
  assertNoUncommittedChangesets,
} from './apply.js';
import { getChangesetsCandidates } from './candidates.js';
import { createChangesetsMode } from './changesets-mode.js';
import { loadChangesetsState } from './load.js';
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
    filteredPlan: STATE.releasePlan,
    selectedChangesets: [],
  },
};

/**
 * Mocks the Changesets state of the project and its candidates.
 */
function mockState(): void {
  vi.when(vi.mocked(loadChangesetsState))
    .calledWith(PROJECT.directoryPath)
    .thenResolve(STATE);
  vi.when(vi.mocked(getChangesetsCandidates))
    .calledWith(STATE, PROJECT)
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

    it('checks the .changeset directory when it prepares the release, and returns the result with no notice', async () => {
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      expect(mode.prepare.title).toBe('Checking the .changeset directory');
      expect(await mode.prepare.run()).toStrictEqual({
        result: 'The .changeset directory has no uncommitted changes',
        notices: [],
      });
      expect(assertNoUncommittedChangesets).toHaveBeenCalledWith(PROJECT);
    });

    it('lists the candidates of the pending changesets', async () => {
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

    it('reads the changesets again every time it lists the candidates', async () => {
      mockState();
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      await mode.listCandidates();
      await mode.listCandidates();

      expect(loadChangesetsState).toHaveBeenCalledTimes(2);
    });

    it('plans the release from the choices, with the changesets that it reads if it did not list the candidates', async () => {
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
      expect(loadChangesetsState).toHaveBeenCalledTimes(1);
    });

    it('plans the release with the changesets that the last candidates call read', async () => {
      const oldState = buildMockChangesetsState({
        releasePlan: {
          changesets: [{ id: 'old-changeset', summary: '', releases: [] }],
          releases: [],
          preState: undefined,
        },
      });
      vi.mocked(loadChangesetsState)
        .mockResolvedValueOnce(oldState)
        .mockResolvedValueOnce(STATE);
      vi.when(vi.mocked(getChangesetsCandidates))
        .calledWith(STATE, PROJECT)
        .thenReturn(CANDIDATES);
      const mode = createChangesetsMode({
        project: PROJECT,
        formatter: 'prettier',
      });

      await mode.listCandidates();
      await mode.listCandidates();
      await mode.plan({ a: 'minor' });

      expect(loadChangesetsState).toHaveBeenCalledTimes(2);
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
