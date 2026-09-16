// A changelog module that opts into categorized mode but does not provide the
// rest of the categorized interface.
import type { NewChangesetWithCommit } from '@changesets/types';

import type { CategorizedReleaseLine } from '../types.js';

export const getReleaseLine = async (
  changeset: NewChangesetWithCommit,
): Promise<string> => `- ${changeset.summary}`;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const getCategorizedReleaseLines = async (
  changeset: NewChangesetWithCommit,
): Promise<CategorizedReleaseLine[]> => [
  { category: 'Added', line: `- ${changeset.summary}` },
];
