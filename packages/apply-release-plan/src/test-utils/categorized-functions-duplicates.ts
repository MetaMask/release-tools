import type { NewChangesetWithCommit, VersionType } from '@changesets/types';

import type { CategorizedReleaseLine } from '../types.js';

export const categories = ['Added', 'Added', 'Changed'];

export const getReleaseLine = async (
  _changeset: NewChangesetWithCommit,
  type: VersionType,
): Promise<string> => `${type === 'patch' ? 'Changed' : 'Added'}: entry`;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const categorizeReleaseLine = async (
  line: string,
): Promise<CategorizedReleaseLine[]> => [
  { category: line.split(':')[0], line: '- line' },
];

export const categorizeDependencyReleaseLine = async (): Promise<
  CategorizedReleaseLine[]
> => [];
