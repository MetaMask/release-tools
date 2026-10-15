import type {
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';

import { getRepo } from './options.js';
import type { CategorizedReleaseLine, ChangelogOptions } from './types.js';

/**
 * Renders dependency version changes as changelog lines.
 *
 * @param _changesets - The changesets in the release.
 * @param dependenciesUpdated - The dependencies updated by the release.
 * @param changelogOpts - The changelog options. Must contain `repo`.
 * @returns One line per updated dependency.
 */
export async function getDependencyReleaseLine(
  _changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
  changelogOpts: ChangelogOptions,
): Promise<string> {
  getRepo(changelogOpts);

  return dependenciesUpdated
    .map((dependency) => {
      if (!dependency.oldVersion || !dependency.newVersion) {
        throw new Error(
          `Dependency ${dependency.name} must have old and new versions`,
        );
      }

      const oldVersion = dependency.oldVersion.startsWith('^')
        ? dependency.oldVersion
        : `^${dependency.oldVersion}`;
      const newVersion = dependency.newVersion.startsWith('^')
        ? dependency.newVersion
        : `^${dependency.newVersion}`;

      return `- Bump \`${dependency.name}\` from \`${oldVersion}\` to \`${newVersion}\``;
    })
    .join('\n');
}

/**
 * Assigns dependency lines to the `Changed` category.
 *
 * @param line - The lines rendered by `getDependencyReleaseLine`.
 * @returns The non-empty lines and their category.
 */
export async function categorizeDependencyReleaseLine(
  line: string,
): Promise<CategorizedReleaseLine[]> {
  return line
    .split('\n')
    .filter((item) => item.trim() !== '')
    .map((item) => ({ category: 'Changed', line: item }));
}
