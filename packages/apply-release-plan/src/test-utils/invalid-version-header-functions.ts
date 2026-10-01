// A changelog module whose `getVersionHeader` export is not a function.
import type { NewChangesetWithCommit } from '@changesets/types';

export const getReleaseLine = async (
  changeset: NewChangesetWithCommit,
): Promise<string> => `- ${changeset.summary}`;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const getVersionHeader = 'not a function';
