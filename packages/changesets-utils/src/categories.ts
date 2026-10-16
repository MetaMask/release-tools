/**
 * The changeset categories supported by the summary parser.
 */
export const CATEGORIES = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
] as const;

export type ChangesetCategory = (typeof CATEGORIES)[number];
