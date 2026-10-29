import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../tests/unit/helpers.js';
import * as changesetsReleaseSourceModule from './changesets-release-source.js';
import type { ChangesetsReleaseSpecification } from './changesets-release-source.js';
import * as initialParametersModule from './initial-parameters.js';
import { main } from './main.js';
import * as monorepoWorkflowOperations from './monorepo-workflow-operations.js';
import * as releaseWorkflowModule from './release-workflow.js';
import type { ReleaseSource } from './release-workflow.js';
import * as ui from './ui.js';

vi.mock('./changesets-release-source');
vi.mock('./initial-parameters');
vi.mock('./monorepo-workflow-operations');
vi.mock('./release-workflow');
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
      releaseMode: 'legacy',
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
      releaseMode: 'legacy',
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
      releaseMode: 'legacy',
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

  it('follows the release workflow with the Changesets source if the project is a monorepo in Changesets mode', async () => {
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
      releaseMode: 'changesets',
    });
    const source = {} as ReleaseSource<ChangesetsReleaseSpecification>;
    const createChangesetsReleaseSourceSpy = vi
      .spyOn(changesetsReleaseSourceModule, 'createChangesetsReleaseSource')
      .mockReturnValue(source);
    const followReleaseWorkflowSpy = vi
      .spyOn(releaseWorkflowModule, 'followReleaseWorkflow')
      .mockResolvedValue();

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(createChangesetsReleaseSourceSpy).toHaveBeenCalledWith({
      project,
      formatter: 'prettier',
      stderr,
    });
    expect(followReleaseWorkflowSpy).toHaveBeenCalledWith({
      project,
      tempDirectoryPath: '/path/to/temp/directory',
      firstRemovingExistingReleaseSpecification: true,
      releaseType: 'backport',
      source,
      stdout,
    });
    expect(
      monorepoWorkflowOperations.followMonorepoWorkflow,
    ).not.toHaveBeenCalled();
    expect(ui.startUI).not.toHaveBeenCalled();
  });

  it('throws before changing anything if the project is a monorepo in Changesets mode and interactive is true', async () => {
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
      releaseMode: 'changesets',
    });

    await expect(
      main({
        argv: [],
        cwd: '/path/to/somewhere',
        stdout,
        stderr,
      }),
    ).rejects.toThrow(
      new Error(
        'The interactive UI (--interactive) is not supported in Changesets mode yet. Run without --interactive to edit the release spec in your editor, or pass --no-changesets to use the legacy workflow.',
      ),
    );

    expect(ui.startUI).not.toHaveBeenCalled();
    expect(releaseWorkflowModule.followReleaseWorkflow).not.toHaveBeenCalled();
    expect(
      monorepoWorkflowOperations.followMonorepoWorkflow,
    ).not.toHaveBeenCalled();
    expect(
      changesetsReleaseSourceModule.createChangesetsReleaseSource,
    ).not.toHaveBeenCalled();
  });

  it('does not use the release workflow directly in legacy mode', async () => {
    const project = buildMockProject({ isMonorepo: true });
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
      releaseType: 'ordinary',
      interactive: false,
      port: 3000,
      formatter: 'prettier',
      releaseMode: 'legacy',
    });

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(
      monorepoWorkflowOperations.followMonorepoWorkflow,
    ).toHaveBeenCalled();
    expect(releaseWorkflowModule.followReleaseWorkflow).not.toHaveBeenCalled();
    expect(
      changesetsReleaseSourceModule.createChangesetsReleaseSource,
    ).not.toHaveBeenCalled();
  });

  it('follows the polyrepo workflow in Changesets mode too', async () => {
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
      releaseType: 'ordinary',
      interactive: true,
      port: 3000,
      formatter: 'prettier',
      releaseMode: 'changesets',
    });

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(releaseWorkflowModule.followReleaseWorkflow).not.toHaveBeenCalled();
    expect(ui.startUI).not.toHaveBeenCalled();
  });
});
