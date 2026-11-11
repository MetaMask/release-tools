import type { SemVer } from '../utils/semver.js';
import type { IncrementableVersionPart } from './release-rules.js';

/**
 * The type of release being created as determined by the parent release.
 *
 * - An *ordinary* release includes features or fixes applied against the
 * latest release and is designated by bumping the first part of that release's
 * version string.
 * - A *backport* release includes fixes applied against a previous release and
 * is designated by bumping the second part of that release's version string.
 */
export type ReleaseType = 'ordinary' | 'backport';

/**
 * The name of the formatter to use for formatting the changelog.
 */
export type Formatter = 'oxfmt' | 'prettier';

/**
 * Describes how to update the version for a package, either by bumping a part
 * of the version or by setting that version exactly.
 */
type VersionSpecifier = IncrementableVersionPart | SemVer;

/**
 * The version specifier for each package to release.
 */
export type VersionSpecifiers = Record<string, VersionSpecifier>;
