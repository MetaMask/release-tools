import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildMockProject,
  buildMockPackage,
} from '../../tests/unit/helpers.js';
import * as projectModule from '../project/project.js';
import * as envModule from '../utils/env.js';
import * as commandLineArgumentsModule from './command-line-arguments.js';
import { determineInitialParameters } from './initial-parameters.js';

vi.mock('./command-line-arguments');
vi.mock('../utils/env');
vi.mock('../project/project');

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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters).toStrictEqual({
        project,
        tempDirectoryPath: '/path/to/temp',
        reset: true,
        releaseType: 'ordinary',
        defaultBranch: 'main',
        modeName: 'legacy',
        frontEndName: 'editor',
        port: 3000,
        formatter: 'prettier',
      });
    });

    it('resolves the given project directory relative to the current working directory', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage(),
      });
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
      });

      expect(readProjectSpy).toHaveBeenCalledWith('/path/to/cwd/project');
    });

    it('resolves the given temporary directory relative to the current working directory', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/cwd',
      });

      expect(initialParameters.tempDirectoryPath).toBe('/path/to/cwd/tmp');
    });

    it('uses a default temporary directory based on the name of the package if no temporary directory was given', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('@foo/bar'),
      });
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/cwd',
      });

      expect(initialParameters.tempDirectoryPath).toStrictEqual(
        path.join(os.tmpdir(), 'create-release-branch', '@foo__bar'),
      );
    });

    it('returns initial parameters including reset: true, derived from a command-line argument of "--reset true"', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.reset).toBe(true);
    });

    it('returns initial parameters including reset: false, derived from a command-line argument of "--reset false"', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.reset).toBe(false);
    });

    it('returns initial parameters including a releaseType of "backport", derived from a command-line argument of "--backport true"', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.releaseType).toBe('backport');
    });

    it('returns initial parameters including a releaseType of "ordinary", derived from a command-line argument of "--backport false"', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.releaseType).toBe('ordinary');
    });

    it('returns initial parameters including a frontEndName of "ui", derived from a command-line argument of "--interactive true"', async () => {
      const project = buildMockProject();
      vi.when(vi.spyOn(commandLineArgumentsModule, 'readCommandLineArguments'))
        .calledWith(['arg1', 'arg2'])
        .thenResolve({
          projectDirectory: '/path/to/project',
          tempDirectory: '/path/to/temp',
          reset: false,
          backport: false,
          defaultBranch: 'main',
          interactive: true,
          port: 3000,
          formatter: 'prettier',
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.frontEndName).toBe('ui');
    });

    it('returns initial parameters including a frontEndName of "editor", derived from a command-line argument of "--interactive false"', async () => {
      const project = buildMockProject();
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
        });
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(projectModule, 'readProject'))
        .calledWith('/path/to/project')
        .thenResolve(project);

      const initialParameters = await determineInitialParameters({
        argv: ['arg1', 'arg2'],
        cwd: '/path/to/somewhere',
      });

      expect(initialParameters.frontEndName).toBe('editor');
    });
  });
});
