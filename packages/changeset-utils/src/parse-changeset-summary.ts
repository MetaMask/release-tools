import { grammarError } from './grammar-error.js';

export type ChangesetCategory =
  | 'Added'
  | 'Changed'
  | 'Removed'
  | 'Fixed'
  | 'Security'
  | 'Deprecated';

export type ParsedEntry = {
  category: ChangesetCategory;
  description: string;
};

const CATEGORIES = [
  'Added',
  'Changed',
  'Removed',
  'Fixed',
  'Security',
  'Deprecated',
] as const;

const HEADING_PATTERN = new RegExp(
  `^##[ \\t]+(${CATEGORIES.join('|')})[ \\t]*$`,
  'iu',
);
const HEADING_LINE_PATTERN = /^#{1,6}(?:[ \t]+|$)/u;
const TOP_LEVEL_BULLET_PATTERN = /^-(?:[ \t].*)?$/u;

/**
 * Formats a list of items as a human-readable disjunction, e.g.
 * `` "`Added`, `Changed`, or `Fixed`" ``.
 *
 * @param items - The items to format.
 * @returns The formatted list.
 */
function formatList(items: readonly string[]): string {
  return new Intl.ListFormat('en', {
    style: 'long',
    type: 'disjunction',
  }).format(items);
}

/**
 * Parses the single categorized entry from a changeset summary.
 *
 * The summary must start with a level-two `## <category>` heading followed by
 * exactly one top-level bullet. Sub-bullets and plain continuation lines are
 * preserved in the entry description.
 *
 * @param summary - The Markdown summary to parse.
 * @returns The parsed entry.
 * @throws {GrammarError} If the summary does not follow the supported grammar.
 */
export function parseChangesetSummary(summary: string): ParsedEntry {
  const lines = summary.split(/\r?\n/u);
  let category: ChangesetCategory | undefined;
  let headingLine = 1;
  let entry: ParsedEntry | undefined;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      continue;
    }

    if (entry) {
      if (TOP_LEVEL_BULLET_PATTERN.test(line)) {
        throw grammarError(
          lineNumber,
          'multiple-entries',
          'Put each entry in a separate changeset file.',
          'A changeset summary must contain exactly one top-level bullet.',
        );
      }
      if (HEADING_LINE_PATTERN.test(line)) {
        throw grammarError(
          lineNumber,
          'multiple-headings',
          'Put each entry in a separate changeset file.',
          'A changeset summary must contain exactly one category heading.',
        );
      }
      entry.description += `\n${line}`;
      continue;
    }

    if (category) {
      if (TOP_LEVEL_BULLET_PATTERN.test(line)) {
        entry = {
          category,
          description: line.slice(1).replace(/^[ \t]+/u, ''),
        };
        if (entry.description === '') {
          throw grammarError(
            lineNumber,
            'empty-entry',
            'Add entry text after `-`.',
            'The top-level bullet must contain non-empty entry text.',
          );
        }
        continue;
      }
      if (HEADING_LINE_PATTERN.test(line)) {
        throw grammarError(
          lineNumber,
          'multiple-headings',
          'Put each entry in a separate changeset file.',
          'A changeset summary must contain exactly one category heading.',
        );
      }
      throw grammarError(
        lineNumber,
        'missing-entry',
        'Add exactly one top-level bullet.',
        'The category heading must be followed by one top-level bullet.',
      );
    }

    if (!HEADING_LINE_PATTERN.test(line)) {
      throw grammarError(
        lineNumber,
        'missing-heading',
        `Start with a level-two heading such as ${formatList([
          '`## Added`',
          '`## Changed`',
          '`## Removed`',
          '`## Fixed`',
        ])}.`,
        'The summary must start with a level-two category heading.',
      );
    }

    if (!/^##[ \t]/u.test(line)) {
      throw grammarError(
        lineNumber,
        'malformed-heading',
        'Use a level-two heading such as `## Added`.',
        'The category heading must use exactly two leading hashes.',
      );
    }

    const headingMatch = line.match(HEADING_PATTERN);
    const canonicalCategory = CATEGORIES.find(
      (candidate) =>
        candidate.toLowerCase() === headingMatch?.[1].toLowerCase(),
    );
    if (!canonicalCategory) {
      throw grammarError(
        lineNumber,
        'unknown-category',
        `Use ${formatList(CATEGORIES.map((name) => `\`${name}\``))} as the category.`,
        'The category heading must name a supported category.',
      );
    }

    category = canonicalCategory;
    headingLine = lineNumber;
  }

  if (!entry) {
    if (category) {
      throw grammarError(
        headingLine,
        'missing-entry',
        'Add exactly one top-level bullet.',
        'The category heading must be followed by one top-level bullet.',
      );
    }
    throw grammarError(
      1,
      'empty-summary',
      'Add a category heading and one entry bullet.',
      'The changeset summary is empty.',
    );
  }

  return entry;
}
