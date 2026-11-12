import type { NewChangesetWithCommit } from '@changesets/types';

/**
 * Returns changesets with releases limited to the selected package names.
 *
 * A kept changeset also keeps its `none` releases, and a changeset with only
 * `none` releases is always kept, so that a release consumes them.
 *
 * The returned changesets and releases are shallow clones. The input values
 * are not modified.
 *
 * @param changesets - Changesets to filter.
 * @param selected - Package names to keep.
 * @returns Changesets that retain at least one selected release, and
 * changesets with only `none` releases.
 */
export function filterChangesets(
  changesets: readonly NewChangesetWithCommit[],
  selected: readonly string[],
): NewChangesetWithCommit[] {
  const selectedNames = new Set(selected);

  return changesets.flatMap((changeset) => {
    const isKept =
      changeset.releases.every(({ type }) => type === 'none') ||
      changeset.releases.some(({ name }) => selectedNames.has(name));
    if (!isKept) {
      return [];
    }

    const releases = changeset.releases
      .filter(({ name, type }) => type === 'none' || selectedNames.has(name))
      .map((release) => ({ ...release }));

    return [{ ...changeset, releases }];
  });
}
