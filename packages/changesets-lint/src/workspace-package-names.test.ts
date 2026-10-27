import {
  Configuration,
  Manifest,
  Project,
  Workspace,
  structUtils,
} from '@yarnpkg/core';
import { npath, ppath } from '@yarnpkg/fslib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { getWorkspacePackageNames } from './workspace-package-names.js';

const projectDirectory = npath.toPortablePath('/repo');
let configuration: Configuration;
let project: Project;
let findConfiguration: MockInstance<typeof Configuration.find>;
let findProject: MockInstance<typeof Project.find>;

/**
 * Adds a workspace with a parsed Yarn manifest to the test project.
 *
 * @param location - The workspace location relative to the project root.
 * @param manifest - The package manifest.
 */
function addWorkspace(
  location: string,
  manifest: Record<string, unknown>,
): void {
  const workspace = new Workspace(
    ppath.join(projectDirectory, npath.toPortablePath(location)),
    { project },
  );
  workspace.manifest = Manifest.fromText(JSON.stringify(manifest));
  project.workspaces.push(workspace);
}

describe('getWorkspacePackageNames', () => {
  beforeEach(() => {
    configuration = Configuration.create(projectDirectory);
    project = new Project(projectDirectory, { configuration });
    findConfiguration = vi
      .spyOn(Configuration, 'find')
      .mockResolvedValue(configuration);
    findProject = vi.spyOn(Project, 'find').mockResolvedValue({
      project,
      workspace: null,
      locator: structUtils.makeLocator(
        structUtils.makeIdent('metamask', 'root'),
        'workspace:.',
      ),
    });
  });

  it('reads scoped and unscoped names, including private packages and the root', async () => {
    addWorkspace('.', { name: '@metamask/root', private: true });
    addWorkspace('packages/public', { name: '@metamask/public' });
    addWorkspace('packages/private', {
      name: '@metamask/private',
      private: true,
    });
    addWorkspace('packages/unscoped', { name: 'unscoped' });

    expect(await getWorkspacePackageNames('/repo')).toStrictEqual(
      new Set([
        '@metamask/root',
        '@metamask/public',
        '@metamask/private',
        'unscoped',
      ]),
    );
  });

  it('uses a portable path and accepts newer and plugin-specific Yarn settings', async () => {
    const portableDirectory = npath.toPortablePath('/portable/repo');
    vi.spyOn(npath, 'toPortablePath').mockReturnValue(portableDirectory);

    await getWorkspacePackageNames('/native/repo');

    expect(npath.toPortablePath).toHaveBeenCalledWith('/native/repo');
    expect(findConfiguration).toHaveBeenCalledExactlyOnceWith(
      portableDirectory,
      null,
      { strict: false },
    );
    expect(findProject).toHaveBeenCalledExactlyOnceWith(
      configuration,
      portableDirectory,
    );
  });

  it.each([{}, { name: null }])(
    'skips an unnamed root workspace %j',
    async (manifest) => {
      addWorkspace('.', manifest);
      addWorkspace('packages/example', { name: '@metamask/example' });
      addWorkspace('packages/unnamed', {});

      expect(await getWorkspacePackageNames('/repo')).toStrictEqual(
        new Set(['@metamask/example']),
      );
    },
  );

  it('returns an empty set when no workspaces are named', async () => {
    addWorkspace('.', {});

    expect(await getWorkspacePackageNames('/repo')).toStrictEqual(new Set());
  });

  it('propagates configuration failures without looking up the project', async () => {
    const error = new Error('Invalid Yarn configuration');
    findConfiguration.mockRejectedValue(error);

    await expect(getWorkspacePackageNames('/repo')).rejects.toBe(error);
    expect(findProject).not.toHaveBeenCalled();
  });

  it('propagates project discovery failures', async () => {
    const error = new Error('No project found');
    findProject.mockRejectedValue(error);

    await expect(getWorkspacePackageNames('/repo')).rejects.toBe(error);
  });
});
