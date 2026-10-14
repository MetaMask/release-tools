import type { NewChangesetWithCommit } from '@changesets/types';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RestoreOptions = {
  changesetDir: string;
  changesets: readonly NewChangesetWithCommit[];
  releasedPackageNames: readonly string[];
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
    const residualReleases = changeset.releases.filter(
      ({ name }) => !released.has(name),
    );

    return residualReleases.length > 0 &&
      residualReleases.length < changeset.releases.length
      ? [
          {
            ...changeset,
            releases: residualReleases.map((release) => ({ ...release })),
          },
        ]
      : [];
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
