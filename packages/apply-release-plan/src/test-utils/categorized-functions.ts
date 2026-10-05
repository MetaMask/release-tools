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
  changeset: NewChangesetWithCommit,
): Promise<string> => changeset.summary;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const categorizeReleaseLine = async (
  _line: string,
  changeset: NewChangesetWithCommit,
): Promise<CategorizedReleaseLine[]> =>
  changeset.summary
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
  _line: string,
  _changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
): Promise<CategorizedReleaseLine[]> =>
  dependenciesUpdated.map((dependency) => ({
    category: 'Changed',
    line: `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
  }));
