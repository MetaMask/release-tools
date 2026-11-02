import fs from 'fs';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../tests/unit/helpers.js';
import type { CliOutput } from './core/cli-output.js';
import type { Mode } from './core/mode.js';
import * as editorFrontEndModule from './frontends/editor/editor-front-end.js';
import * as initialParametersModule from './initial-parameters.js';
import { main } from './main.js';
import * as ui from './ui.js';

vi.mock('./initial-parameters');
vi.mock('./frontends/editor/editor-front-end');
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
    const stdout = new MockWritable();
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
    const runSpy = vi.fn();
    const createEditorFrontEndSpy = vi
      .spyOn(editorFrontEndModule, 'createEditorFrontEnd')
      .mockReturnValue({ run: runSpy });

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(createEditorFrontEndSpy).toHaveBeenCalledWith({
      tempDirectoryPath: '/path/to/temp/directory',
      reset: true,
    });
    expect(runSpy).toHaveBeenCalledWith({
      project,
      mode: expect.objectContaining({ name: 'legacy' }) as Mode<unknown>,
      releaseType: 'backport',
      output: expect.any(Object) as CliOutput,
    });
    expect(stdout.data()).toContain(
      'Project appears to have workspaces. Following monorepo workflow.\n',
    );
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
      output: expect.any(Object) as CliOutput,
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
    const createEditorFrontEndSpy = vi.spyOn(
      editorFrontEndModule,
      'createEditorFrontEnd',
    );

    await main({
      argv: [],
      cwd: '/path/to/somewhere',
      stdout,
      stderr,
    });

    expect(createEditorFrontEndSpy).not.toHaveBeenCalled();
  });
});
