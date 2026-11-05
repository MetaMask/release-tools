/**
 * Why a package is offered for release: it has changes, it depends on a
 * package that is being released, or it has entries in its changelog.
 */
export type CandidateKind =
  /**
   * The package has its own changes (legacy mode: commits since its latest
   * release tag; Changesets mode: pending changesets).
   */
  | 'changes'
  /**
   * The package is released only because one of its dependencies is released.
   */
  | 'dependency'
  /**
   * Changesets mode only: the package has no changesets, but its changelog has
   * hand-written entries in its Unreleased section (during the migration to
   * Changesets).
   */
  | 'legacy-entries';

/**
 * A package that the maintainer can choose to include in the release.
 *
 * @property name - The name of the package.
 * @property currentVersion - The version of the package before the release.
 * @property plannedVersion - The version the package will be released at, if
 * it is already known.
 * @property kind - Why the package is offered for release.
 * @property changeCount - The number of changes in the package, if known.
 */
export type Candidate = {
  name: string;
  currentVersion: string;
  plannedVersion?: string;
  kind: CandidateKind;
  changeCount?: number;
};
