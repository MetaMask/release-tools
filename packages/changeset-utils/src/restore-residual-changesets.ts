import type { NewChangesetWithCommit } from '@changesets/types';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { filterChangesets } from './filter-changesets.js';

export type RestoreOptions = {
  changesetDir: string;
  changesets: NewChangesetWithCommit[];
  releasedPackageNames: string[];
};

/**
 * Restores changeset files for packages that remain unreleased after a partial release.
 *
 * Fully consumed changesets are left untouched because the release process has
 * already removed them. Residual changesets are written with their original
 * summaries and the remaining releases.
 *
 * @param options - The changeset directory and release selection.
 * @param options.changesetDir - The changeset directory.
 * @param options.changesets - The original parsed changesets.
 * @param options.releasedPackageNames - Packages consumed by the release.
 * @returns A promise that resolves after residual files are written.
 */
export async function restoreResidualChangesets({
  changesetDir,
  changesets,
  releasedPackageNames,
}: RestoreOptions): Promise<void> {
  const released = new Set(releasedPackageNames);
  const residualChangesets = changesets.flatMap((changeset) => {
    const wasReleased = changeset.releases.some(({ name }) =>
      released.has(name),
    );

    if (!wasReleased) {
      return [];
    }

    const residualPackageNames = changeset.releases
      .map(({ name }) => name)
      .filter((name) => !released.has(name));

    return filterChangesets([changeset], residualPackageNames);
  });

  await Promise.all(
    residualChangesets.map(async (changeset) => {
      const frontmatter = changeset.releases
        .map(({ name, type }) => `${JSON.stringify(name)}: ${type}`)
        .join('\n');
      await writeFile(
        join(changesetDir, `${changeset.id}.md`),
        `---\n${frontmatter}\n---\n${changeset.summary}`,
      );
    }),
  );
}
