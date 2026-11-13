import { defaultConfig, readConfig } from '@changesets/config';
import { getReleasePlan } from '@changesets/get-release-plan';
import type { Config } from '@changesets/types';
import { getPackages } from '@manypkg/get-packages';
import { describe, expect, it, vi } from 'vitest';

import { buildMockChangesetsState } from '../../../tests/unit/helpers.js';
import {
  CHANGELOG_MODULE,
  ChangesetsSetupError,
  loadChangesets,
} from './load.js';
import type { ChangesetsState } from './load.js';

vi.mock(import('@changesets/config'), async (importActual) => ({
  ...(await importActual()),
  readConfig: vi.fn(),
}));
vi.mock('@changesets/get-release-plan');
vi.mock('@manypkg/get-packages');

const CONFIG_PATH = '/path/to/project/.changeset/config.json';

const CONFIG: Config = {
  ...defaultConfig,
  changelog: [CHANGELOG_MODULE, { repository: 'example-org/example-repo' }],
};

const format = {
  name: (text: string): string => `<${text}>`,
  dim: (text: string): string => `(${text})`,
};

/**
 * Mocks what Changesets reads from the project.
 *
 * @param overrides - The parts of the state to change.
 * @returns The mocked state.
 */
function mockChangesetsState(
  overrides: Partial<ChangesetsState> = {},
): ChangesetsState {
  const state = buildMockChangesetsState({ config: CONFIG, ...overrides });
  vi.mocked(getPackages).mockResolvedValue(
    state.packages as Awaited<ReturnType<typeof getPackages>>,
  );
  vi.mocked(readConfig).mockResolvedValue({
    config: state.config,
    warnings: [],
    errors: undefined,
  });
  vi.mocked(getReleasePlan).mockResolvedValue(state.fullPlan);
  return state;
}

describe('load', () => {
  describe('loadChangesets', () => {
    it('reads the packages, the configuration, and the release plan of all pending Changesets', async () => {
      const state = mockChangesetsState({
        fullPlan: {
          changesets: [
            {
              id: 'brave-cats-sing',
              summary: 'Add a feature',
              releases: [{ name: '@scope/a', type: 'minor' }],
            },
          ],
          releases: [
            {
              name: '@scope/a',
              type: 'minor',
              oldVersion: '1.0.0',
              newVersion: '1.1.0',
              changesets: ['brave-cats-sing'],
            },
          ],
          preState: undefined,
        },
      });

      expect(await loadChangesets('/path/to/project')).toStrictEqual(state);
      expect(readConfig).toHaveBeenCalledWith(
        '/path/to/project',
        state.packages,
      );
      expect(getReleasePlan).toHaveBeenCalledWith(
        '/path/to/project',
        undefined,
        state.config,
      );
    });

    it('accepts a project that is exiting Changesets pre mode', async () => {
      mockChangesetsState({
        fullPlan: {
          changesets: [],
          releases: [],
          preState: { mode: 'exit', tag: 'beta' },
        },
      });

      const { fullPlan } = await loadChangesets('/path/to/project');

      expect(fullPlan.preState?.mode).toBe('exit');
    });

    it('throws a setup error if the project has no Changesets configuration', async () => {
      mockChangesetsState();
      const cause = Object.assign(new Error('Not found'), { code: 'ENOENT' });
      vi.mocked(readConfig).mockRejectedValue(cause);

      const promise = loadChangesets('/path/to/project');

      await expect(promise).rejects.toThrow(
        new ChangesetsSetupError({
          problem: 'Changesets mode needs a Changesets configuration.',
          details: [
            'Set up Changesets in the project, or release it in legacy mode.',
          ],
          filePath: CONFIG_PATH,
        }),
      );
      await expect(promise).rejects.toHaveProperty('cause', cause);
    });

    it('throws other errors from reading the configuration as they are', async () => {
      mockChangesetsState();
      const error = new SyntaxError('Unexpected end of JSON input');
      vi.mocked(readConfig).mockRejectedValue(error);

      await expect(loadChangesets('/path/to/project')).rejects.toBe(error);
    });

    it('throws a setup error that lists the problems of a configuration that is not valid', async () => {
      mockChangesetsState();
      vi.mocked(readConfig).mockResolvedValue({
        config: undefined,
        warnings: [],
        errors: ['Problem 1', 'Problem 2'],
      });

      await expect(loadChangesets('/path/to/project')).rejects.toThrow(
        new ChangesetsSetupError({
          problem: 'The Changesets configuration is not valid:',
          details: ['Problem 1', 'Problem 2'],
          filePath: CONFIG_PATH,
        }),
      );
    });

    it.each([
      { description: 'no changelog module', changelog: false as const },
      {
        description: 'another changelog module',
        changelog: ['@changesets/cli/changelog', null] as const,
      },
    ])(
      'throws a setup error if the configuration has $description',
      async ({ changelog }) => {
        mockChangesetsState({ config: { ...CONFIG, changelog } });

        await expect(loadChangesets('/path/to/project')).rejects.toThrow(
          new ChangesetsSetupError({
            problem:
              'Changesets mode needs the @metamask/changesets-changelog changelog module.',
            details: [
              'Set "changelog" to ["@metamask/changesets-changelog", { "repository": "<owner>/<repo>" }] in the Changesets configuration.',
            ],
            filePath: CONFIG_PATH,
          }),
        );
      },
    );

    it('throws a setup error if the project is in Changesets pre mode', async () => {
      mockChangesetsState({
        fullPlan: {
          changesets: [],
          releases: [],
          preState: { mode: 'pre', tag: 'beta' },
        },
      });

      await expect(loadChangesets('/path/to/project')).rejects.toThrow(
        new ChangesetsSetupError({
          problem: 'Changesets pre mode is not supported.',
          details: [
            'Exit pre mode with "changeset pre exit", then run this tool again.',
          ],
          filePath: '/path/to/project/.changeset/pre.json',
        }),
      );
    });
  });

  describe('ChangesetsSetupError', () => {
    it('describes the problem, the details, then the file path', () => {
      const error = new ChangesetsSetupError({
        problem: 'Some problem.',
        details: ['Some detail.'],
        filePath: '/some/file',
      });

      expect(error.describe(format)).toStrictEqual({
        title: 'Some problem.',
        lines: ['Some detail.', '(/some/file)'],
      });
      expect(error.message).toBe('Some problem.\nSome detail.\n/some/file');
    });

    it('has no file path line if there is no file path', () => {
      const error = new ChangesetsSetupError({
        problem: 'Some problem.',
        details: ['Some detail.'],
      });

      expect(error.message).toBe('Some problem.\nSome detail.');
    });
  });
});
