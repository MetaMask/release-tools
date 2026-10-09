// A categorized changelog module used to test categorized entry rendering.
// Summary lines are expected to look like `<Category>: <text>`.
import type {
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';

import type { CategorizedReleaseLine, GetVersionHeader } from '../types.js';

export const categories = ['Added', 'Changed', 'Fixed'];

export const getVersionHeader: GetVersionHeader = async (release) =>
  `## [${release.newVersion}]`;

export const getReleaseLine = async (
  _changeset: NewChangesetWithCommit,
): Promise<string> => _changeset.summary;

export const getDependencyReleaseLine = async (
  _changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
): Promise<string> =>
  dependenciesUpdated
    .map(
      (dependency) =>
        `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
    )
    .join('\n');

export const categorizeReleaseLine = async (
  line: string,
  _changeset: NewChangesetWithCommit,
): Promise<CategorizedReleaseLine[]> =>
  line
    .split('\n')
    .filter((item) => item.trim() !== '')
    .flatMap((item) => {
      const [category, ...rest] = item.split(':');
      const text = rest.join(':').trim();
      if (category.trim() === 'FanOut') {
        return [
          { category: 'Added', line: `- ${text}` },
          { category: 'Changed', line: `- ${text}` },
        ];
      }
      return [{ category: category.trim(), line: `- ${text}` }];
    });

export const categorizeDependencyReleaseLine = async (
  line: string,
): Promise<CategorizedReleaseLine[]> =>
  line
    .split('\n')
    .filter((item) => item.trim() !== '')
    .map((item) => ({ category: 'Changed', line: item }));
