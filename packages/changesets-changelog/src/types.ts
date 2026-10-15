/**
 * The options passed to the changelog module through the `changelog` field of
 * the Changesets config.
 */
export type ChangelogOptions = null | Record<string, unknown>;

/**
 * A single changelog line together with the section it belongs to.
 *
 * This mirrors the type `@metamask/apply-release-plan` expects from a
 * categorized changelog module. It is declared here so that this package does
 * not depend on the package that loads it.
 */
export type CategorizedReleaseLine = {
  /**
   * The title of the section the line belongs to, e.g. `Added`.
   */
  category: string;
  /**
   * The changelog line itself.
   */
  line: string;
};
