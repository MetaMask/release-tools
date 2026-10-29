import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withSandbox } from '../tests/helpers.js';
import {
  buildMockProject,
  buildMockPackage,
  createNoopWriteStream,
} from '../tests/unit/helpers.js';
import * as commandLineArgumentsModule from './command-line-arguments.js';
import * as envModule from './env.js';
import * as fsModule from './fs.js';
import { determineInitialParameters } from './initial-parameters.js';
import * as projectModule from './project.js';

vi.mock('./command-line-arguments');
vi.mock('./env');
vi.mock('./project');

describe('initial-parameters', () => {
  describe('determineInitialParameters', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns an object derived from command-line arguments and environment variables that contains data necessary to run the workflow', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: true,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
        stderr,
      });

      expect(initialParameters).toStrictEqual({
        project,
        tempDirectoryPath: '/path/to/temp',
        reset: true,
        releaseType: 'ordinary',
        defaultBranch: 'main',
        interactive: false,
        port: 3000,
        formatter: 'prettier',
        releaseMode: 'legacy',
      });
    });

    it('resolves the given project directory relative to the current working directory', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage(),
      });
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: 'project',
          tempDirectory: undefined,
          reset: true,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      const readProjectSpy = vi
        .spyOn(projectModule, 'readProject')
        .mockResolvedValue(project);

      await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/cwd',
        stderr,
      });

      expect(readProjectSpy).toHaveBeenCalledWith('/path/to/cwd/project', {
        stderr,
      });
    });

    it('resolves the given temporary directory relative to the current working directory', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: 'tmp',
          reset: true,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/cwd',
        stderr,
      });

      expect(initialParameters.tempDirectoryPath).toBe('/path/to/cwd/tmp');
    });

    it('uses a default temporary directory based on the name of the package if no temporary directory was given', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('@foo/bar'),
      });
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: undefined,
          reset: true,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/cwd',
        stderr,
      });

      expect(initialParameters.tempDirectoryPath).toStrictEqual(
        path.join(os.tmpdir(), 'create-release-branch', '@foo__bar'),
      );
    });

    it('returns initial parameters including reset: true, derived from a command-line argument of "--reset true"', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: true,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
        stderr,
      });

      expect(initialParameters.reset).toBe(true);
    });

    it('returns initial parameters including reset: false, derived from a command-line argument of "--reset false"', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: false,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
        stderr,
      });

      expect(initialParameters.reset).toBe(false);
    });

    it('returns initial parameters including a releaseType of "backport", derived from a command-line argument of "--backport true"', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: false,
          backport: true,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
        stderr,
      });

      expect(initialParameters.releaseType).toBe('backport');
    });

    it('returns initial parameters including a releaseType of "ordinary", derived from a command-line argument of "--backport false"', async () => {
      const project = buildMockProject();
      const stderr = createNoopWriteStream();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: false,
          backport: false,
          defaultBranch: 'main',
          interactive: false,
          port: 3000,
          formatter: 'prettier',
          changesets: true,
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project', { stderr })
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
        stderr,
      });

      expect(initialParameters.releaseType).toBe('ordinary');
    });

    it('returns releaseMode "changesets" when .changeset/config.json exists', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const stderr = createNoopWriteStream();
        await writeChangesetConfig(sandbox.directoryPath);
        mockCommandLineArguments({
          projectDirectory: sandbox.directoryPath,
          changesets: true,
        });
        vi.spyOn(projectModule, 'readProject').mockResolvedValue(project);

        const initialParameters = await determineInitialParameters({
          argv: ['arg1', 'arg2'],
          cwd: '/path/to/somewhere',
          stderr,
        });

        expect(initialParameters.releaseMode).toBe('changesets');
      });
    });

    it('returns releaseMode "legacy" when .changeset/config.json does not exist', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const stderr = createNoopWriteStream();
        mockCommandLineArguments({
          projectDirectory: sandbox.directoryPath,
          changesets: true,
        });
        vi.spyOn(projectModule, 'readProject').mockResolvedValue(project);

        const initialParameters = await determineInitialParameters({
          argv: ['arg1', 'arg2'],
          cwd: '/path/to/somewhere',
          stderr,
        });

        expect(initialParameters.releaseMode).toBe('legacy');
      });
    });

    it('returns releaseMode "legacy" when --no-changesets is given even if .changeset/config.json exists', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const stderr = createNoopWriteStream();
        await writeChangesetConfig(sandbox.directoryPath);
        mockCommandLineArguments({
          projectDirectory: sandbox.directoryPath,
          changesets: false,
        });
        vi.spyOn(projectModule, 'readProject').mockResolvedValue(project);

        const initialParameters = await determineInitialParameters({
          argv: ['arg1', 'arg2'],
          cwd: '/path/to/somewhere',
          stderr,
        });

        expect(initialParameters.releaseMode).toBe('legacy');
      });
    });

    it('does not write to the project when determining the release mode', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const stderr = createNoopWriteStream();
        await writeChangesetConfig(sandbox.directoryPath);
        mockCommandLineArguments({
          projectDirectory: sandbox.directoryPath,
          changesets: true,
        });
        vi.spyOn(projectModule, 'readProject').mockResolvedValue(project);
        const writeSpies = [
          vi.spyOn(fs, 'writeFile'),
          vi.spyOn(fs.promises, 'writeFile'),
          vi.spyOn(fsModule, 'writeFile'),
          vi.spyOn(fsModule, 'writeJsonFile'),
          vi.spyOn(fsModule, 'ensureDirectoryPathExists'),
          vi.spyOn(fsModule, 'removeFile'),
        ];

        const initialParameters = await determineInitialParameters({
          argv: ['arg1', 'arg2'],
          cwd: '/path/to/somewhere',
          stderr,
        });

        expect(initialParameters.releaseMode).toBe('changesets');
        for (const writeSpy of writeSpies) {
          expect(writeSpy).not.toHaveBeenCalled();
        }
      });
    });
  });
});

/**
 * Writes an empty Changesets configuration file to the given project.
 *
 * @param projectDirectoryPath - The path to the project directory.
 */
async function writeChangesetConfig(
  projectDirectoryPath: string,
): Promise<void> {
  await fs.promises.mkdir(path.join(projectDirectoryPath, '.changeset'));
  await fs.promises.writeFile(
    path.join(projectDirectoryPath, '.changeset', 'config.json'),
    '{}',
  );
}

/**
 * Mocks the command-line arguments for the `arg1 arg2` argv.
 *
 * @param overrides - The arguments to override.
 * @param overrides.projectDirectory - The project directory.
 * @param overrides.changesets - Whether to use the Changesets workflow.
 */
function mockCommandLineArguments({
  projectDirectory,
  changesets,
}: {
  projectDirectory: string;
  changesets: boolean;
}): void {
  vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
    .calledWith(['arg1', 'arg2'])
    .thenResolve({
      projectDirectory,
      tempDirectory: '/path/to/temp',
      reset: false,
      backport: false,
      defaultBranch: 'main',
      interactive: false,
      port: 3000,
      formatter: 'prettier',
      changesets,
    });
}
