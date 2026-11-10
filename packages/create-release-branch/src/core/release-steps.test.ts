import { S_STEP_SUBMIT } from '@clack/prompts';
import { stripVTControlCharacters } from 'node:util';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockMode,
  buildMockPackage,
  buildMockProject,
  createNoopCliOutput,
  writtenText,
} from '../../tests/unit/helpers.js';
import type { Candidate } from './candidates.js';
import { createCliOutput } from './cli-output.js';
import type { CliOutput } from './cli-output.js';
import type { ModePlan } from './mode.js';
import * as releaseBranchModule from './release-branch.js';
import {
  applyRelease,
  checkChoices,
  finishRelease,
  startRelease,
} from './release-steps.js';
import * as repoModule from './repo.js';
import * as yarnCommandsModule from './yarn-commands.js';

vi.mock('./release-branch');
vi.mock('./repo');
vi.mock('./yarn-commands');

/**
 * Builds an output that records when each step and task starts and ends, and
 * the lines that each task logs.
 *
 * @param calls - The list to which the start and end of each step and task,
 * and the lines, are added.
 * @returns The output.
 */
function buildRecordingOutput(calls: string[]): CliOutput {
  return {
    ...createNoopCliOutput(),
    async step(label, run) {
      calls.push(`start ${label}`);
      const result = await run();
      calls.push(`end ${label}`);
      return result;
    },
    async task(label, run) {
      calls.push(`start task ${label}`);
      const result = await run((line) => {
        calls.push(`log ${line}`);
      });
      calls.push(`end task ${label}`);
      return result;
    },
    warnList(title, items) {
      calls.push(`warnList ${title} ${items.join(', ')}`);
    },
    done(text) {
      calls.push(`done ${text}`);
    },
  };
}

/**
 * Builds an output that writes plain text to a mock standard out.
 *
 * @returns The output, and the lines of the completed steps that it wrote.
 */
function buildOutputWithStepLines(): {
  output: CliOutput;
  stdout: MockWritable;
  stepLines: () => string[];
} {
  const stdout = new MockWritable();
  const output = createCliOutput({ stdout, stderr: new MockWritable() });
  const stepLines = (): string[] =>
    stripVTControlCharacters(writtenText(stdout))
      .split('\n')
      .filter((line) => line.startsWith(`${S_STEP_SUBMIT}  `))
      .map((line) => line.slice(`${S_STEP_SUBMIT}  `.length));
  return { output, stdout, stepLines };
}

const notices = [
  { title: 'Title 1:', items: ['a', 'b'] },
  { title: 'Title 2:', items: ['c'] },
];

describe('release-steps', () => {
  it('prints the commit lines', async () => {
    const { output, stepLines } = buildOutputWithStepLines();
    vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
      '2.0.0',
    );
    vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
      firstRun: true,
    });

    await startRelease({
      project: buildMockProject(),
      releaseType: 'ordinary',
      mode: buildMockMode(),
      output,
    });
    await finishRelease({
      project: buildMockProject(),
      newReleaseVersion: '2.0.0',
      releases: [],
      output,
    });

    expect(stepLines()).toContain('Committed "Initialize Release 2.0.0"');
    expect(stepLines()).toContain('Committed "Update Release 2.0.0"');
  });

  describe('startRelease', () => {
    it('prepares and commits only on the first run', async () => {
      const project = buildMockProject();
      const prepare = vi.fn().mockResolvedValue([]);
      const mode = buildMockMode({ prepare });
      const determineReleaseVersionSpy = vi
        .spyOn(releaseBranchModule, 'determineReleaseVersion')
        .mockReturnValue('2.0.0');
      const ensureReleaseBranchSpy = vi.spyOn(
        releaseBranchModule,
        'ensureReleaseBranch',
      );
      const commitAllChangesSpy = vi.spyOn(repoModule, 'commitAllChanges');
      ensureReleaseBranchSpy.mockResolvedValueOnce({ firstRun: true });
      ensureReleaseBranchSpy.mockResolvedValueOnce({ firstRun: false });

      const firstResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: createNoopCliOutput(),
      });
      const secondResult = await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: createNoopCliOutput(),
      });

      expect(firstResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(secondResult).toStrictEqual({ newReleaseVersion: '2.0.0' });
      expect(determineReleaseVersionSpy).toHaveBeenCalledWith(
        project,
        'ordinary',
      );
      expect(ensureReleaseBranchSpy).toHaveBeenCalledWith(project, '2.0.0');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledTimes(1);
      expect(commitAllChangesSpy).toHaveBeenCalledWith(
        project.directoryPath,
        'Initialize Release 2.0.0',
        { allowEmpty: true },
      );
    });

    it('prepares in a step before the Initialize commit', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      const mode = buildMockMode({
        prepare: vi.fn().mockImplementation(async () => {
          calls.push('prepare');
          return [];
        }),
      });
      vi.spyOn(
        releaseBranchModule,
        'determineReleaseVersion',
      ).mockImplementation(() => {
        calls.push('determineReleaseVersion');
        return '2.0.0';
      });
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockImplementation(
        async () => {
          calls.push('ensureReleaseBranch');
          return { firstRun: true };
        },
      );
      vi.spyOn(repoModule, 'commitAllChanges').mockImplementation(
        async (directoryPath, commitMessage) => {
          calls.push(`commitAllChanges ${directoryPath} ${commitMessage}`);
        },
      );

      await startRelease({
        project,
        releaseType: 'ordinary',
        mode,
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'determineReleaseVersion',
        'start Creating the release branch',
        'ensureReleaseBranch',
        'end Creating the release branch',
        'start Updating changelogs',
        'prepare',
        'end Updating changelogs',
        'commitAllChanges /path/to/project Initialize Release 2.0.0',
        'done Committed "Initialize Release 2.0.0"',
      ]);
    });

    it.each([
      { firstRun: true, result: 'Created branch release/2.0.0' },
      { firstRun: false, result: 'Switched to branch release/2.0.0' },
    ])(
      'ends the "Creating the release branch" step with "$result"',
      async ({ firstRun, result }) => {
        const { output, stepLines } = buildOutputWithStepLines();
        vi.spyOn(
          releaseBranchModule,
          'determineReleaseVersion',
        ).mockReturnValue('2.0.0');
        vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
          firstRun,
        });

        await startRelease({
          project: buildMockProject(),
          releaseType: 'ordinary',
          mode: buildMockMode(),
          output,
        });

        expect(stepLines()[0]).toBe(result);
      },
    );

    it('ends the "Updating changelogs" step with "Updated changelogs"', async () => {
      const { output, stepLines } = buildOutputWithStepLines();
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: true,
      });

      await startRelease({
        project: buildMockProject(),
        releaseType: 'ordinary',
        mode: buildMockMode(),
        output,
      });

      expect(stepLines()[1]).toBe('Updated changelogs');
    });

    it('prints the notices from prepare after the step', async () => {
      const calls: string[] = [];
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: true,
      });
      vi.spyOn(repoModule, 'commitAllChanges').mockImplementation(async () => {
        calls.push('commitAllChanges');
      });

      await startRelease({
        project: buildMockProject(),
        releaseType: 'ordinary',
        mode: buildMockMode({
          prepare: vi.fn().mockResolvedValue(notices),
        }),
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Creating the release branch',
        'end Creating the release branch',
        'start Updating changelogs',
        'end Updating changelogs',
        'warnList Title 1: a, b',
        'warnList Title 2: c',
        'commitAllChanges',
        'done Committed "Initialize Release 2.0.0"',
      ]);
    });

    it('only creates the release branch after the first run', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });

      await startRelease({
        project,
        releaseType: 'ordinary',
        mode: buildMockMode(),
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Creating the release branch',
        'end Creating the release branch',
      ]);
    });
  });

  describe('checkChoices', () => {
    it('returns rule errors without planning', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const listCandidates = vi.fn().mockResolvedValue([]);
      const plan = vi.fn();
      const mode = buildMockMode({ listCandidates, plan });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'foo' },
      });

      expect(result).toStrictEqual({
        errors: [
          {
            packageName: 'a',
            entryIndex: 0,
            problem: '"foo" is not a valid version specifier',
            hint: 'Use major, minor, patch, or a version like 1.2.3.',
          },
        ],
        dependencyFindings: {},
      });
      expect(listCandidates).toHaveBeenCalledWith({ a: 'foo' });
      expect(plan).not.toHaveBeenCalled();
    });

    it('returns mode plan errors', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const planErrors = [{ problem: 'Nothing to release' }];
      const plan = vi.fn().mockResolvedValue({ errors: planErrors });
      const mode = buildMockMode({ plan });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'major' },
      });

      expect(result).toStrictEqual({
        errors: planErrors,
        dependencyFindings: {},
      });
      expect(plan).toHaveBeenCalledWith({ a: 'major' });
    });

    it('returns the mode plan when there are no errors', async () => {
      const project = buildMockProject({
        workspacePackages: { a: buildMockPackage('a', '1.0.0') },
      });
      const plan: ModePlan<string> = {
        releases: [{ name: 'a', newVersion: '2.0.0' }],
        data: 'data',
      };
      const mode = buildMockMode({
        plan: vi.fn().mockResolvedValue({ plan }),
      });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'major' },
      });

      expect(result).toStrictEqual({
        dependencyFindings: {},
        plan,
      });
    });

    it('passes only changes and legacy-entries candidates as packages with changes', async () => {
      const project = buildMockProject({
        workspacePackages: {
          a: buildMockPackage('a', '1.0.0', {
            validatedManifest: {
              dependencies: { changed: '1.0.0', dependent: '1.0.0' },
              peerDependencies: { legacy: '1.0.0' },
            },
          }),
          changed: buildMockPackage('changed', '1.0.0'),
          dependent: buildMockPackage('dependent', '1.0.0', {
            hasChangesSinceLatestRelease: true,
          }),
          legacy: buildMockPackage('legacy', '1.0.0'),
        },
      });
      const candidates: Candidate[] = [
        { name: 'changed', currentVersion: '1.0.0', kind: 'changes' },
        { name: 'dependent', currentVersion: '1.0.0', kind: 'dependency' },
        { name: 'legacy', currentVersion: '1.0.0', kind: 'legacy-entries' },
      ];
      const plan = vi.fn();
      const mode = buildMockMode({
        listCandidates: vi.fn().mockResolvedValue(candidates),
        plan,
      });

      const result = await checkChoices({
        project,
        mode,
        choices: { a: 'minor' },
      });

      expect(result.dependencyFindings).toStrictEqual({
        a: {
          missingDirectDependentNames: [],
          missingPeerDependentNames: [],
          missingDependencies: ['changed', 'legacy'],
        },
      });
      expect(plan).not.toHaveBeenCalled();
    });
  });

  describe('applyRelease', () => {
    it('applies the plan with the new release version in a step', async () => {
      const calls: string[] = [];
      const apply = vi.fn().mockImplementation(async () => {
        calls.push('apply');
        return [];
      });
      const mode = buildMockMode({ apply });
      const plan: ModePlan<string> = { releases: [], data: 'data' };

      await applyRelease({
        mode,
        plan,
        newReleaseVersion: '2.0.0',
        output: buildRecordingOutput(calls),
      });

      expect(apply).toHaveBeenCalledWith(plan, '2.0.0');
      expect(calls).toStrictEqual([
        'start Applying the release',
        'apply',
        'end Applying the release',
      ]);
    });

    it('prints the notices from apply after the step', async () => {
      const calls: string[] = [];

      await applyRelease({
        mode: buildMockMode({ apply: vi.fn().mockResolvedValue(notices) }),
        plan: { releases: [], data: 'data' },
        newReleaseVersion: '2.0.0',
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start Applying the release',
        'end Applying the release',
        'warnList Title 1: a, b',
        'warnList Title 2: c',
      ]);
    });

    it.each([
      { names: ['a', 'b'], result: 'Bumped 2 packages' },
      { names: ['a'], result: 'Bumped 1 package' },
    ])(
      'ends the "Applying the release" step with "$result"',
      async ({ names, result }) => {
        const { output, stepLines } = buildOutputWithStepLines();

        await applyRelease({
          mode: buildMockMode(),
          plan: {
            releases: names.map((name) => ({ name, newVersion: '1.0.0' })),
            data: 'data',
          },
          newReleaseVersion: '2.0.0',
          output,
        });

        expect(stepLines()).toStrictEqual([result]);
      },
    );
  });

  describe('finishRelease', () => {
    it('runs each Yarn command in a task, then commits outside any step', async () => {
      const project = buildMockProject();
      const calls: string[] = [];
      vi.spyOn(yarnCommandsModule, 'fixConstraints').mockImplementation(
        async (directoryPath, onLine) => {
          calls.push(`fixConstraints ${directoryPath}`);
          onLine('constraints output');
        },
      );
      vi.spyOn(yarnCommandsModule, 'updateYarnLockfile').mockImplementation(
        async (directoryPath, onLine) => {
          calls.push(`updateYarnLockfile ${directoryPath}`);
          onLine('install output');
        },
      );
      vi.spyOn(
        yarnCommandsModule,
        'deduplicateDependencies',
      ).mockImplementation(async (directoryPath, onLine) => {
        calls.push(`deduplicateDependencies ${directoryPath}`);
        onLine('dedupe output');
      });
      vi.spyOn(repoModule, 'commitAllChanges').mockImplementation(
        async (directoryPath, commitMessage) => {
          calls.push(`commitAllChanges ${directoryPath} ${commitMessage}`);
        },
      );

      await finishRelease({
        project,
        newReleaseVersion: '2.0.0',
        releases: [],
        output: buildRecordingOutput(calls),
      });

      expect(calls).toStrictEqual([
        'start task Fixing Yarn constraints',
        'fixConstraints /path/to/project',
        'log constraints output',
        'end task Fixing Yarn constraints',
        'start task Installing dependencies',
        'updateYarnLockfile /path/to/project',
        'log install output',
        'end task Installing dependencies',
        'start task Deduplicating dependencies',
        'deduplicateDependencies /path/to/project',
        'log dedupe output',
        'end task Deduplicating dependencies',
        'commitAllChanges /path/to/project Update Release 2.0.0',
        'done Committed "Update Release 2.0.0"',
      ]);
    });

    it.each([
      {
        index: 0,
        label: 'Fixing Yarn constraints',
        result: 'Fixed Yarn constraints',
      },
      {
        index: 1,
        label: 'Installing dependencies',
        result: 'Installed dependencies',
      },
      {
        index: 2,
        label: 'Deduplicating dependencies',
        result: 'Deduplicated dependencies',
      },
    ])('ends the "$label" task with "$result"', async ({ index, result }) => {
      const { output, stepLines } = buildOutputWithStepLines();

      await finishRelease({
        project: buildMockProject(),
        newReleaseVersion: '2.0.0',
        releases: [],
        output,
      });

      expect(stepLines()[index]).toBe(result);
    });

    it('prints the summary with every released package', async () => {
      const { output, stdout } = buildOutputWithStepLines();

      await finishRelease({
        project: buildMockProject(),
        newReleaseVersion: '2.0.0',
        releases: [
          { name: '@metamask/a', newVersion: '1.0.0' },
          { name: '@metamask/longer-name', newVersion: '12.0.0' },
        ],
        output,
      });

      const text = stripVTControlCharacters(writtenText(stdout));
      const summary = text.slice(text.indexOf('2 packages released'));
      expect(text.indexOf('Next: review the changelogs')).toBeLessThan(
        text.indexOf('2 packages released'),
      );
      expect(text).toContain(
        'Next: review the changelogs, then push the branch and open the release PR.',
      );
      expect(summary).toContain('Branch  release/2.0.0');
      expect(summary).toContain('@metamask/a            1.0.0');
      expect(summary).toContain('@metamask/longer-name  12.0.0');
      expect(summary).toContain('Release 2.0.0 is ready on release/2.0.0');
    });

    it('says "1 package released" for one package', async () => {
      const { output, stdout } = buildOutputWithStepLines();

      await finishRelease({
        project: buildMockProject(),
        newReleaseVersion: '2.0.0',
        releases: [{ name: 'a', newVersion: '1.0.0' }],
        output,
      });

      expect(writtenText(stdout)).toContain('1 package released');
    });
  });
});
