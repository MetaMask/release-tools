import { S_BAR, S_BAR_START, S_WARN } from '@clack/prompts';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockPackage,
  buildMockPrepareStep,
  buildMockProject,
  writtenText,
} from '../../tests/unit/helpers.js';
import { createCliOutput } from './cli-output.js';
import type { ReleaseContext } from './front-end.js';
import type { Mode } from './mode.js';
import type { Notice } from './notices.js';
import { runRelease } from './run-release.js';

/**
 * Builds a release context for use in tests.
 *
 * @param args - The arguments.
 * @param args.isMonorepo - Whether the project has workspaces.
 * @param args.initialize - Optional initialize hook for the mode.
 * @param args.stdout - The stream that receives standard out.
 * @param args.stderr - The stream that receives standard error.
 * @returns The release context.
 */
function buildContext({
  isMonorepo,
  initialize,
  stdout,
  stderr = new MockWritable(),
}: {
  isMonorepo: boolean;
  initialize?: () => Promise<Notice[]>;
  stdout: MockWritable;
  stderr?: MockWritable;
}): ReleaseContext {
  const mode: Mode<unknown> = {
    name: 'legacy',
    ...(initialize === undefined ? {} : { initialize }),
    prepare: buildMockPrepareStep(),
    listCandidates: vi.fn(),
    plan: vi.fn(),
    apply: vi.fn(),
    getReleaseNotes: vi.fn(),
  };

  return {
    project: buildMockProject({
      isMonorepo,
      rootPackage: buildMockPackage('root', '1389.0.0'),
    }),
    mode,
    releaseType: 'ordinary',
    output: createCliOutput({ stdout, stderr }),
  };
}

describe('run-release', () => {
  describe('runRelease', () => {
    it('runs the front end for a monorepo', async () => {
      const context = buildContext({
        isMonorepo: true,
        stdout: new MockWritable(),
      });
      const run = vi.fn();

      await runRelease(context, { run });

      expect(run).toHaveBeenCalledWith(context);
    });

    it('prints the header with the project name, the shape, and the mode', async () => {
      const stdout = new MockWritable();
      const context = buildContext({ isMonorepo: true, stdout });

      await runRelease(context, { run: vi.fn() });

      expect(writtenText(stdout)).toBe(
        `${S_BAR_START}  create-release-branch  root · monorepo · legacy mode\n`,
      );
    });

    it('prints notices from mode.initialize before running the front end', async () => {
      const stderr = new MockWritable();
      const context = buildContext({
        isMonorepo: true,
        initialize: async () => [
          {
            title: '2 packages have something to report:',
            items: ['a', 'b'],
          },
        ],
        stdout: new MockWritable(),
        stderr,
      });
      let stderrWhenRunning = '';
      const run = vi.fn().mockImplementation(async () => {
        stderrWhenRunning = writtenText(stderr);
      });

      await runRelease(context, { run });

      expect(stderrWhenRunning).toBe(
        [
          `${S_BAR}\n${S_WARN}  2 packages have something to report:\n`,
          `${S_BAR}    a\n`,
          `${S_BAR}    b\n`,
        ].join(''),
      );
    });

    it('prints nothing when mode.initialize returns no notices', async () => {
      const stderr = new MockWritable();
      const context = buildContext({
        isMonorepo: true,
        initialize: async () => [],
        stdout: new MockWritable(),
        stderr,
      });

      await runRelease(context, { run: vi.fn() });

      expect(stderr.data()).toStrictEqual([]);
    });

    it('prints nothing when mode.initialize is not defined', async () => {
      const stderr = new MockWritable();
      const context = buildContext({
        isMonorepo: true,
        stdout: new MockWritable(),
        stderr,
      });

      await runRelease(context, { run: vi.fn() });

      expect(stderr.data()).toStrictEqual([]);
    });

    it('prints the polyrepo message and stops', async () => {
      const stdout = new MockWritable();
      const context = buildContext({ isMonorepo: false, stdout });
      const run = vi.fn();

      await runRelease(context, { run });

      expect(writtenText(stdout)).toContain(
        'Project does not appear to have any workspaces. Following polyrepo workflow.',
      );
      expect(run).not.toHaveBeenCalled();
    });
  });
});
