// A standard (non-categorized) changelog module that customizes the version
// heading.
import type { NewChangesetWithCommit } from '@changesets/types';

import type { GetVersionHeader } from '../types.js';

export const getReleaseLine = async (
  changeset: NewChangesetWithCommit,
): Promise<string> => `- ${changeset.summary}`;

export const getDependencyReleaseLine = async (): Promise<string> => '';

export const getVersionHeader: GetVersionHeader = async (release) =>
  `## v${release.newVersion}`;
