import type {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
  VersionType,
} from '@changesets/types';

/**
 * A single changelog line together with the section it belongs to.
 */
export type CategorizedReleaseLine = {
  /**
   * The title of the section the line belongs to (e.g. "Added"). Must be one
   * of the `categories` declared by the changelog module.
   */
  category: string;
  /**
   * The changelog line itself (Markdown, typically a list item).
   */
  line: string;
};

/**
 * Categorizes a line produced by `getReleaseLine` into one or more named
 * sections.
 */
export type CategorizeReleaseLine = (
  line: string,
  changeset: NewChangesetWithCommit,
  type: VersionType,
  changelogOpts: null | Record<string, unknown>,
) => CategorizedReleaseLine[] | Promise<CategorizedReleaseLine[]>;

/**
 * Categorizes a line produced by `getDependencyReleaseLine`.
 */
export type CategorizeDependencyReleaseLine = (
  line: string,
  changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
  changelogOpts: null | Record<string, unknown>,
) => CategorizedReleaseLine[] | Promise<CategorizedReleaseLine[]>;

/**
 * Renders the heading line that opens a release entry. Any changelog module
 * (categorized or not) can export this to control the heading format — for
 * example `## [1.2.3]` for Keep a Changelog, or `## v1.2.3`. When absent, the
 * default `## <version>` heading is used.
 */
export type GetVersionHeader = (
  release: ModCompWithPackage,
  changelogOpts: null | Record<string, unknown>,
) => string | Promise<string>;

/**
 * A changelog module that opts into categorized changelog entries. When a
 * module exports `categorizeReleaseLine`, the release entry is rendered
 * as a version heading followed by one `### <category>` section per entry in
 * `categories` (in that order), instead of the default
 * `### Major/Minor/Patch Changes` sections.
 */
export type CategorizedChangelogFunctions = ChangelogFunctions & {
  categorizeReleaseLine: CategorizeReleaseLine;
  categorizeDependencyReleaseLine: CategorizeDependencyReleaseLine;
  /**
   * The complete, ordered list of section titles. Lines returned for a
   * category not present in this list are an error.
   */
  categories: readonly string[];
  getVersionHeader?: GetVersionHeader;
};
