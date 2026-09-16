// A categorized changelog module used to test the categorized entry mode.
// Summary lines are expected to look like `<Category>: <text>`.
import type {
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';

import type { CategorizedReleaseLine } from '../types.js';

export const categories = ['Added', 'Changed', 'Fixed'];

export const getReleaseLine = async (
  changeset: NewChangesetWithCommit,
): Promise<string> => `- ${changeset.summary}`;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const getCategorizedReleaseLines = async (
  changeset: NewChangesetWithCommit,
): Promise<CategorizedReleaseLine[]> =>
  changeset.summary
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [category, ...rest] = line.split(':');
      return {
        category: category.trim(),
        line: `- ${rest.join(':').trim()}`,
      };
    });

export const getCategorizedDependencyReleaseLines = async (
  _changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
): Promise<CategorizedReleaseLine[]> =>
  dependenciesUpdated.map((dependency) => ({
    category: 'Changed',
    line: `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
  }));
