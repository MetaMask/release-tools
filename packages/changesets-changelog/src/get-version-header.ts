import type { ModCompWithPackage } from '@changesets/types';

/**
 * Renders a Keep a Changelog version heading.
 *
 * @param release - The release being rendered.
 * @returns The bracketed version heading.
 */
export function getVersionHeader(release: ModCompWithPackage): string {
  return `## [${release.newVersion}]`;
}
