import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../tests/unit/helpers.js';
import * as initialParametersModule from './initial-parameters.js';
import { main } from './main.js';
import * as monorepoWorkflowOperations from './monorepo-workflow-operations.js';
import * as ui from './ui.js';

vi.mock('./initial-parameters');
vi.mock('./monorepo-workflow-operations');
vi.mock('./ui');
vi.mock('./dirname', () => ({
  getCurrentDirectoryPath: vi.fn().mockReturnValue('/path/to/somewhere'),
}));
vi.mock('open', () => ({
  apps: {
    browser: vi.fn(),
  },
}));

describe('main', () => {
  it('executes the CLI monorepo workflow if the project is a monorepo and interactive is false', async () => {
    const project = buildMockProject({ isMonorepo: true });
    const stdout = fs.createWriteStream('/dev/null');
    const stderr = fs.createWriteStream('/dev/null');
    vi.spyOn(
      initialParametersModule,
      'determineInitialParameters',
    ).mockResolvedValue({
      project,
      tempDirectoryPath: '/path/to/temp/directory',
      reset: true,
      defaultBranch: 'main',
      releaseType: 'backport',
      interactive: false,
      port: 3000,
      formatter: 'prettier',
    });
    const followMonorepoWorkflowSpy = vi
      .spyOn(monorepoWorkflowOperations, 'followMonorepoWorkflow')
      .mockResolvedValue();

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(followMonorepoWorkflowSpy).toHaveBeenCalledWith({
      project,
      tempDirectoryPath: '/path/to/temp/directory',
      firstRemovingExistingReleaseSpecification: true,
      releaseType: 'backport',
      defaultBranch: 'main',
      formatter: 'prettier',
      stdout,
      stderr,
    });
  });

  it('executes the interactive UI monorepo workflow if the project is a monorepo and interactive is true', async () => {
    const project = buildMockProject({ isMonorepo: true });
    const stdout = fs.createWriteStream('/dev/null');
    const stderr = fs.createWriteStream('/dev/null');
    vi.spyOn(
      initialParametersModule,
      'determineInitialParameters',
    ).mockResolvedValue({
      project,
      tempDirectoryPath: '/path/to/temp/directory',
      reset: true,
      defaultBranch: 'main',
      releaseType: 'backport',
      interactive: true,
      port: 3000,
      formatter: 'prettier',
    });
    const startUISpy = vi.spyOn(ui, 'startUI').mockResolvedValue();

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(startUISpy).toHaveBeenCalledWith({
      project,
      releaseType: 'backport',
      defaultBranch: 'main',
      port: 3000,
      formatter: 'prettier',
      stdout,
      stderr,
    });
  });

  it('executes the polyrepo workflow if the project is within a polyrepo', async () => {
    const project = buildMockProject({ isMonorepo: false });
    const stdout = fs.createWriteStream('/dev/null');
    const stderr = fs.createWriteStream('/dev/null');
    vi.spyOn(
      initialParametersModule,
      'determineInitialParameters',
    ).mockResolvedValue({
      project,
      tempDirectoryPath: '/path/to/temp/directory',
      reset: false,
      defaultBranch: 'main',
      releaseType: 'backport',
      interactive: false,
      port: 3000,
      formatter: 'prettier',
    });
    const followMonorepoWorkflowSpy = vi
      .spyOn(monorepoWorkflowOperations, 'followMonorepoWorkflow')
      .mockResolvedValue();

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(followMonorepoWorkflowSpy).not.toHaveBeenCalled();
  });
});
