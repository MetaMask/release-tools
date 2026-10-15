/**
 * The changelog sections this module can produce, in the order they are
 * rendered. These are the "Keep a Changelog" categories, which are also the
 * categories `parseChangesetSummary` accepts in a changeset heading.
 */
export const categories = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
] as const;
