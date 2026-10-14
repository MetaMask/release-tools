import type { NewChangesetWithCommit } from '@changesets/types';

/**
 * Returns changesets with releases limited to the selected package names.
 *
 * The returned changesets and releases are shallow clones. The input values
 * are not modified.
 *
 * @param changesets - Changesets to filter.
 * @param selected - Package names to keep.
 * @returns Changesets that retain at least one selected release.
 */
export function filterChangesets(
  changesets: NewChangesetWithCommit[],
  selected: string[],
): NewChangesetWithCommit[] {
  return changesets.flatMap((changeset) => {
    const releases = changeset.releases
      .filter(({ name }) => selected.includes(name))
      .map((release) => ({ ...release }));

    return releases.length > 0 ? [{ ...changeset, releases }] : [];
  });
}
