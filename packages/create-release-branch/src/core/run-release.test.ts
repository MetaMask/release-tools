import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../../tests/unit/helpers.js';
import { createCliOutput } from './cli-output.js';
import type { ReleaseContext } from './front-end.js';
import type { Mode } from './mode.js';
import { runRelease } from './run-release.js';

/**
 * Builds a release context for use in tests.
 *
 * @param args - The arguments.
 * @param args.isMonorepo - Whether the project has workspaces.
 * @param args.stdout - The stream that receives standard out.
 * @returns The release context.
 */
function buildContext({
  isMonorepo,
  stdout,
}: {
  isMonorepo: boolean;
  stdout: MockWritable;
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
    project: buildMockProject({ isMonorepo }),
    mode,
    releaseType: 'ordinary',
    output: createCliOutput({ stdout, stderr: new MockWritable() }),
  };
}

describe('run-release', () => {
  describe('runRelease', () => {
    it('runs the front end for a monorepo', async () => {
      const stdout = new MockWritable();
      const context = buildContext({ isMonorepo: true, stdout });
      const run = vi.fn();

      await runRelease(context, { run });

      expect(stdout.data().join('')).toContain(
        'Project appears to have workspaces. Following monorepo workflow.',
      );
      expect(run).toHaveBeenCalledWith(context);
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
