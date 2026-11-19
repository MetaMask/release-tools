import { assertExhaustive } from '@metamask/utils';

import type { FrontEnd, FrontEndName } from '../core/front-end.js';
import type { Mode, ModeName } from '../core/mode.js';
import type { Formatter } from '../core/types.js';
import { createEditorFrontEnd } from '../frontends/editor/editor-front-end.js';
import { createUIFrontEnd } from '../frontends/ui/server.js';
import { createChangesetsMode } from '../modes/changesets/changesets-mode.js';
import { createLegacyMode } from '../modes/legacy/legacy-mode.js';
import type { Project } from '../project/project.js';

/**
 * Creates the release mode with the given name.
 *
 * @param name - The name of the mode.
 * @param options - The options for the mode.
 * @param options.project - Information about the project.
 * @param options.defaultBranch - The name of the default branch.
 * @param options.formatter - The formatter for the changelogs.
 * @returns The mode.
 */
export function selectMode(
  name: ModeName,
  options: {
    project: Project;
    defaultBranch: string;
    formatter: Formatter;
  },
): Mode<unknown> {
  switch (name) {
    case 'legacy':
      return createLegacyMode(options);

    case 'changesets':
      return createChangesetsMode(options);

    default:
      return assertExhaustive(name);
  }
}

/**
 * Creates the front end with the given name.
 *
 * @param name - The name of the front end.
 * @param options - The options for the front end.
 * @param options.tempDirectoryPath - The directory for the release spec of
 * the editor front end.
 * @param options.reset - Whether the editor front end discards a previous
 * release spec.
 * @param options.port - The port of the UI front end.
 * @returns The front end.
 */
export function selectFrontEnd(
  name: FrontEndName,
  {
    tempDirectoryPath,
    reset,
    port,
  }: { tempDirectoryPath: string; reset: boolean; port: number },
): FrontEnd {
  switch (name) {
    case 'editor':
      return createEditorFrontEnd({ tempDirectoryPath, reset });

    case 'ui':
      return createUIFrontEnd({ port });

    default:
      return assertExhaustive(name);
  }
}
