import { S_BAR, S_ERROR, S_INFO, S_WARN } from '@clack/prompts';
import { ChildProcess } from 'child_process';
import { once } from 'events';
import net from 'net';
import type { AddressInfo } from 'net';
import openBrowser from 'open';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMockMode,
  buildMockPackage,
  buildMockProject,
  createNoopCliOutput,
} from '../../../tests/unit/helpers.js';
import { createCliOutput } from '../../core/cli-output.js';
import type { ReleaseContext } from '../../core/front-end.js';
import type { Mode } from '../../core/mode.js';
import * as releaseBranchModule from '../../core/release-branch.js';
import { IncrementableVersionParts } from '../../core/release-rules.js';
import * as repoModule from '../../core/repo.js';
import * as yarnCommandsModule from '../../core/yarn-commands.js';
import { createLegacyMode } from '../../modes/legacy/legacy-mode.js';
import type { Project } from '../../project/project.js';
import { createApp, createUIFrontEnd } from './server.js';

vi.mock('open');
vi.mock('../../core/release-branch');
vi.mock('../../core/repo');
vi.mock('../../core/yarn-commands');

/**
 * Builds a project in which package "b" depends on package "a".
 *
 * @returns The mock project.
 */
function buildProjectWithDependent(): Project {
  return buildMockProject({
    workspacePackages: {
      a: buildMockPackage('a', '1.0.0'),
      b: buildMockPackage('b', '1.0.0', {
        validatedManifest: { dependencies: { a: '1.0.0' } },
      }),
    },
  });
}

/**
 * Creates a context for running a release with the given mode.
 *
 * @param mode - The release mode.
 * @param overrides - The properties to override in the context.
 * @returns The context.
 */
function buildContext(
  mode: Mode<unknown>,
  overrides: Partial<ReleaseContext> = {},
): ReleaseContext {
  return {
    project: buildMockProject(),
    mode,
    releaseType: 'ordinary',
    output: createNoopCliOutput(),
    ...overrides,
  };
}

/**
 * Serves the UI app on a free port, runs the given test against it, then
 * closes the server.
 *
 * @param options - The options for `createApp`.
 * @param test - The test to run. It gets the URL of the server.
 */
async function withApp(
  options: Parameters<typeof createApp>[0],
  test: (url: string) => Promise<void>,
): Promise<void> {
  const server = createApp(options).listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await test(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

/**
 * Sends the release choices to an endpoint of the UI server.
 *
 * @param url - The URL of the endpoint.
 * @param choices - The release choices.
 * @returns The response.
 */
async function postChoices(
  url: string,
  choices: Record<string, string | null>,
): Promise<Response> {
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(choices),
  });
}

/**
 * Finds a port that no server is listening on.
 *
 * @returns The port.
 */
async function findFreePort(): Promise<number> {
  const server = net.createServer().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
}

describe('server', () => {
  describe('createApp', () => {
    describe('/api/packages', () => {
      it('passes major bumps as choices', async () => {
        const listCandidates = vi.fn().mockResolvedValue([
          { name: 'a', currentVersion: '1.0.0', kind: 'changes' },
          { name: 'b', currentVersion: '2.0.0', kind: 'dependency' },
        ]);
        const mode = buildMockMode({ listCandidates });

        await withApp(
          {
            context: buildContext(mode),
            newReleaseVersion: '2.0.0',
            closeServer: vi.fn(),
          },
          async (url) => {
            const response = await fetch(`${url}/api/packages?majorBumps=a,b`);

            expect(await response.json()).toStrictEqual([
              { name: 'a', version: '1.0.0' },
              { name: 'b', version: '2.0.0' },
            ]);
          },
        );

        expect(listCandidates).toHaveBeenCalledWith({ a: 'major', b: 'major' });
      });

      it('accepts repeated or missing major bumps', async () => {
        const listCandidates = vi.fn().mockResolvedValue([]);
        const mode = buildMockMode({ listCandidates });

        await withApp(
          {
            context: buildContext(mode),
            newReleaseVersion: '2.0.0',
            closeServer: vi.fn(),
          },
          async (url) => {
            await fetch(`${url}/api/packages?majorBumps=a&majorBumps=b`);
            await fetch(`${url}/api/packages`);
          },
        );

        expect(listCandidates).toHaveBeenNthCalledWith(1, {
          a: 'major',
          b: 'major',
        });
        expect(listCandidates).toHaveBeenNthCalledWith(2, {});
      });

      it('passes errors to Express', async () => {
        const mode = buildMockMode({
          listCandidates: vi.fn().mockRejectedValue(new Error('boom')),
        });

        await withApp(
          {
            context: buildContext(mode),
            newReleaseVersion: '2.0.0',
            closeServer: vi.fn(),
          },
          async (url) => {
            const response = await fetch(`${url}/api/packages`);

            expect(response.status).toBe(500);
          },
        );
      });
    });

    describe('/api/check-packages', () => {
      it('returns dependency findings', async () => {
        const mode = buildMockMode({
          plan: vi
            .fn()
            .mockResolvedValue({ plan: { releases: [], data: 'x' } }),
        });
        const context = buildContext(mode, {
          project: buildProjectWithDependent(),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer: vi.fn() },
          async (url) => {
            const errorResponse = await postChoices(
              `${url}/api/check-packages`,
              { a: 'major' },
            );
            const successResponse = await postChoices(
              `${url}/api/check-packages`,
              { a: 'minor' },
            );

            expect(await errorResponse.json()).toStrictEqual({
              status: 'error',
              errors: {
                a: {
                  missingDirectDependentNames: ['b'],
                  missingPeerDependentNames: [],
                  missingDependencies: [],
                },
              },
            });
            expect(await successResponse.json()).toStrictEqual({
              status: 'success',
            });
          },
        );
      });

      it('returns 400 on error', async () => {
        const stderr = new MockWritable();
        const mode = buildMockMode({
          listCandidates: vi
            .fn()
            .mockRejectedValue(
              new Error('boom', { cause: new Error('some cause') }),
            ),
        });
        const context = buildContext(mode, {
          output: createCliOutput({ stdout: new MockWritable(), stderr }),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer: vi.fn() },
          async (url) => {
            const response = await postChoices(`${url}/api/check-packages`, {});

            expect(response.status).toBe(400);
            expect(await response.text()).toBe('Invalid request');
          },
        );

        expect(stderr.data().join('')).toBe(
          `${S_BAR}\n${S_ERROR}  boom\n${S_BAR}  Caused by: some cause\n`,
        );
      });
    });

    describe('/api/release', () => {
      it("returns rule errors with today's line numbers", async () => {
        const apply = vi.fn();
        const closeServer = vi.fn();
        const mode = buildMockMode({ apply });
        const context = buildContext(mode, {
          project: buildProjectWithDependent(),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer },
          async (url) => {
            const response = await postChoices(`${url}/api/release`, {
              a: 'major',
              nonexistent: 'minor',
            });

            expect(await response.json()).toStrictEqual({
              status: 'error',
              errors: [
                {
                  message: [
                    'a: has a major bump, but its direct dependents are not in the release spec: b',
                    'Add them to the release spec, or set them to intentionally-skip.',
                  ],
                },
                {
                  message: [
                    'nonexistent: is not a package in the project',
                    'Check the name, or remove the line.',
                  ],
                  lineNumber: 3,
                },
              ],
            });
          },
        );

        expect(apply).not.toHaveBeenCalled();
        expect(closeServer).not.toHaveBeenCalled();
      });

      it('returns the problem and hint as the message', async () => {
        const mode = buildMockMode({
          plan: vi.fn().mockResolvedValue({
            errors: [
              { packageName: 'a', problem: 'is wrong', hint: 'Fix it.' },
              { problem: 'is broken' },
            ],
          }),
        });

        await withApp(
          {
            context: buildContext(mode),
            newReleaseVersion: '2.0.0',
            closeServer: vi.fn(),
          },
          async (url) => {
            const response = await postChoices(`${url}/api/release`, {});

            expect(await response.json()).toStrictEqual({
              status: 'error',
              errors: [
                { message: ['a: is wrong', 'Fix it.'] },
                { message: 'is broken' },
              ],
            });
          },
        );
      });

      it('applies, finishes, and closes the server', async () => {
        const plan = {
          releases: [{ name: 'a', newVersion: '1.1.0' }],
          data: 'x',
        };
        const apply = vi.fn().mockResolvedValue([]);
        const closeServer = vi.fn();
        const mode = buildMockMode({
          plan: vi.fn().mockResolvedValue({ plan }),
          apply,
        });
        const context = buildContext(mode, {
          project: buildProjectWithDependent(),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer },
          async (url) => {
            const response = await postChoices(`${url}/api/release`, {
              a: 'minor',
            });

            expect(await response.json()).toStrictEqual({ status: 'success' });
          },
        );

        expect(apply).toHaveBeenCalledWith(plan, '2.0.0');
        expect(yarnCommandsModule.fixConstraints).toHaveBeenCalledWith(
          '/path/to/project',
          expect.any(Function),
        );
        expect(yarnCommandsModule.updateYarnLockfile).toHaveBeenCalledWith(
          '/path/to/project',
          expect.any(Function),
        );
        expect(yarnCommandsModule.deduplicateDependencies).toHaveBeenCalledWith(
          '/path/to/project',
          expect.any(Function),
        );
        expect(repoModule.commitAllChanges).toHaveBeenCalledWith(
          '/path/to/project',
          'Update Release 2.0.0',
        );
        expect(closeServer).toHaveBeenCalledTimes(1);
      });

      it('drops null and intentionally-skip', async () => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '1.0.0'),
            b: buildMockPackage('b', '1.0.0'),
            c: buildMockPackage('c', '1.0.0'),
          },
        });
        const apply = vi.fn().mockResolvedValue([]);
        const mode = {
          ...createLegacyMode({
            project,
            defaultBranch: 'main',
            formatter: 'prettier',
          }),
          apply,
        };
        const context = buildContext(mode, { project });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer: vi.fn() },
          async (url) => {
            const response = await postChoices(`${url}/api/release`, {
              a: 'major',
              b: 'intentionally-skip',
              c: null,
            });

            expect(await response.json()).toStrictEqual({ status: 'success' });
          },
        );

        expect(apply).toHaveBeenCalledWith(
          {
            releases: [{ name: 'a', newVersion: '2.0.0' }],
            data: { a: IncrementableVersionParts.major },
          },
          '2.0.0',
        );
      });

      it('returns 400 on error', async () => {
        const stderr = new MockWritable();
        const closeServer = vi.fn();
        const mode = buildMockMode({
          plan: vi.fn().mockRejectedValue(new Error('boom')),
        });
        const context = buildContext(mode, {
          output: createCliOutput({ stdout: new MockWritable(), stderr }),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer },
          async (url) => {
            const response = await postChoices(`${url}/api/release`, {});

            expect(response.status).toBe(400);
            expect(await response.text()).toBe('Invalid request');
          },
        );

        expect(stderr.data().join('')).toBe(`${S_BAR}\n${S_ERROR}  boom\n`);
        expect(closeServer).not.toHaveBeenCalled();
      });
    });

    describe('/api/changelog', () => {
      it("returns the mode's release notes", async () => {
        const getReleaseNotes = vi.fn().mockResolvedValue('# Changelog\n');
        const mode = buildMockMode({ getReleaseNotes });

        await withApp(
          {
            context: buildContext(mode),
            newReleaseVersion: '2.0.0',
            closeServer: vi.fn(),
          },
          async (url) => {
            const response = await fetch(`${url}/api/changelog?package=a`);

            expect(await response.text()).toBe('# Changelog\n');
          },
        );

        expect(getReleaseNotes).toHaveBeenCalledWith('a');
      });

      it('returns 500 on error', async () => {
        const stderr = new MockWritable();
        const mode = buildMockMode({
          getReleaseNotes: vi.fn().mockRejectedValue(new Error('boom')),
        });
        const context = buildContext(mode, {
          output: createCliOutput({ stdout: new MockWritable(), stderr }),
        });

        await withApp(
          { context, newReleaseVersion: '2.0.0', closeServer: vi.fn() },
          async (url) => {
            const response = await fetch(`${url}/api/changelog?package=a`);

            expect(response.status).toBe(500);
            expect(await response.text()).toBe('Internal Server Error');
          },
        );

        expect(stderr.data().join('')).toBe(`${S_BAR}\n${S_ERROR}  boom\n`);
      });
    });
  });

  describe('createUIFrontEnd', () => {
    it('serves the UI until the release is done', async () => {
      const port = await findFreePort();
      const stdout = new MockWritable();
      const mode = buildMockMode({
        plan: vi.fn().mockResolvedValue({ plan: { releases: [], data: 'x' } }),
      });
      const context = buildContext(mode, {
        output: createCliOutput({ stdout, stderr: new MockWritable() }),
      });
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });
      vi.mocked(openBrowser).mockResolvedValue(new ChildProcess());

      const running = createUIFrontEnd({ port }).run(context);
      await vi.waitFor(() => {
        expect(openBrowser).toHaveBeenCalled();
      });
      const response = await postChoices(
        `http://localhost:${port}/api/release`,
        {},
      );
      await running;

      expect(await response.json()).toStrictEqual({ status: 'success' });
      expect(openBrowser).toHaveBeenCalledWith(`http://localhost:${port}`);
      expect(stdout.data().join('')).toContain(
        'Release 2.0.0 is ready on release/2.0.0',
      );
    });

    it('prints the UI address', async () => {
      const port = await findFreePort();
      const stdout = new MockWritable();
      const mode = buildMockMode({
        plan: vi.fn().mockResolvedValue({ plan: { releases: [], data: 'x' } }),
      });
      const context = buildContext(mode, {
        output: createCliOutput({ stdout, stderr: new MockWritable() }),
      });
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });
      vi.mocked(openBrowser).mockResolvedValue(new ChildProcess());

      const running = createUIFrontEnd({ port }).run(context);
      await vi.waitFor(() => {
        expect(openBrowser).toHaveBeenCalled();
      });
      await postChoices(`http://localhost:${port}/api/release`, {});
      await running;

      expect(stdout.data().join('')).toContain(
        `${S_BAR}\n${S_INFO}  Opening the release UI at http://localhost:${port}\n`,
      );
    });

    it('warns when the browser cannot be opened', async () => {
      const port = await findFreePort();
      const stderr = new MockWritable();
      const mode = buildMockMode({
        plan: vi.fn().mockResolvedValue({ plan: { releases: [], data: 'x' } }),
      });
      const context = buildContext(mode, {
        output: createCliOutput({ stdout: new MockWritable(), stderr }),
      });
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });
      vi.mocked(openBrowser).mockRejectedValue(new Error('no browser'));

      const running = createUIFrontEnd({ port }).run(context);
      await vi.waitFor(() => {
        expect(stderr.data()).toHaveLength(1);
      });
      await postChoices(`http://localhost:${port}/api/release`, {});
      await running;

      expect(stderr.data().join('')).toBe(
        `${S_BAR}\n${S_WARN}  Could not open your browser (Error: no browser). Open http://localhost:${port} yourself.\n`,
      );
    });

    it('rejects if the server cannot start', async () => {
      const blocker = net.createServer().listen(0);
      await once(blocker, 'listening');
      const { port } = blocker.address() as AddressInfo;
      const stderr = new MockWritable();
      const context = buildContext(buildMockMode(), {
        output: createCliOutput({ stdout: new MockWritable(), stderr }),
      });
      vi.spyOn(releaseBranchModule, 'determineReleaseVersion').mockReturnValue(
        '2.0.0',
      );
      vi.spyOn(releaseBranchModule, 'ensureReleaseBranch').mockResolvedValue({
        firstRun: false,
      });

      try {
        await expect(createUIFrontEnd({ port }).run(context)).rejects.toThrow(
          expect.objectContaining({
            message: `Could not start the release UI on port ${port}`,
            cause: expect.objectContaining({ code: 'EADDRINUSE' }) as Error,
          }),
        );
      } finally {
        blocker.close();
      }

      expect(stderr.data()).toStrictEqual([]);
    });
  });
});
