import { S_BAR, S_BAR_START, S_WARN } from '@clack/prompts';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockPackage,
  buildMockProject,
} from '../../tests/unit/helpers.js';
import { createCliOutput } from './cli-output.js';
import type { ReleaseContext } from './front-end.js';
import type { Mode } from './mode.js';
import { runRelease } from './run-release.js';

/**
 * Builds a release context for use in tests.
 *
 * @param args - The arguments.
 * @param args.isMonorepo - Whether the project has workspaces.
 * @param args.packagesUsingRootTag - The packages that use the root tag.
 * @param args.stdout - The stream that receives standard out.
 * @param args.stderr - The stream that receives standard error.
 * @returns The release context.
 */
function buildContext({
  isMonorepo,
  packagesUsingRootTag = [],
  stdout,
  stderr = new MockWritable(),
}: {
  isMonorepo: boolean;
  packagesUsingRootTag?: string[];
  stdout: MockWritable;
  stderr?: MockWritable;
}): ReleaseContext {
  const mode: Mode<unknown> = {
    name: 'legacy',
    prepare: vi.fn(),
    listCandidates: vi.fn(),
    plan: vi.fn(),
    apply: vi.fn(),
    getReleaseNotes: vi.fn(),
  };

  return {
    project: buildMockProject({
      isMonorepo,
      rootPackage: buildMockPackage('root', '1389.0.0'),
      packagesUsingRootTag,
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

      expect(stdout.data().join('')).toBe(
        `${S_BAR_START}  create-release-branch  root · monorepo · legacy mode\n`,
      );
    });

    it.each([
      {
        packagesUsingRootTag: ['a', 'b'],
        title:
          '2 packages have no tag for their current version, so changes are compared against the root tag v1389.0.0:',
      },
      {
        packagesUsingRootTag: ['a'],
        title:
          '1 package has no tag for its current version, so changes are compared against the root tag v1389.0.0:',
      },
    ])(
      'prints the packages that use the root tag before running the front end ($packagesUsingRootTag)',
      async ({ packagesUsingRootTag, title }) => {
        const stderr = new MockWritable();
        const context = buildContext({
          isMonorepo: true,
          packagesUsingRootTag,
          stdout: new MockWritable(),
          stderr,
        });
        let stderrWhenRunning = '';
        const run = vi.fn().mockImplementation(async () => {
          stderrWhenRunning = stderr.data().join('');
        });

        await runRelease(context, { run });

        expect(stderrWhenRunning).toBe(
          [
            `${S_BAR}\n${S_WARN}  ${title}\n`,
            ...packagesUsingRootTag.map((name) => `${S_BAR}    ${name}\n`),
          ].join(''),
        );
      },
    );

    it('prints nothing when no package uses the root tag', async () => {
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

      expect(stdout.data().join('')).toContain(
        'Project does not appear to have any workspaces. Following polyrepo workflow.',
      );
      expect(run).not.toHaveBeenCalled();
    });
  });
});
