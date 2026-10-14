import { GrammarError } from './grammar-error.js';

const CATEGORIES = [
  'Added',
  'Changed',
  'Removed',
  'Fixed',
  'Security',
  'Deprecated',
] as const;

export type ChangesetCategory = (typeof CATEGORIES)[number];

export type ParsedEntry = {
  category: ChangesetCategory;
  description: string;
};

const HEADING_PATTERN = new RegExp(
  `^##[ \\t]+(${CATEGORIES.join('|')})[ \\t]*$`,
  'iu',
);
const HEADING_LINE_PATTERN = /^#{1,6}(?:[ \t]+|$)/u;
const LEVEL_TWO_HEADING_PATTERN = /^##[ \t]/u;
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

    if ((entry || category) && HEADING_LINE_PATTERN.test(line)) {
      throw new GrammarError(
        'A changeset summary must contain exactly one category heading.',
        lineNumber,
        'multiple-headings',
        'Put each entry in a separate changeset file.',
      );
    }

    if (entry) {
      if (TOP_LEVEL_BULLET_PATTERN.test(line)) {
        throw new GrammarError(
          'A changeset summary must contain exactly one top-level bullet.',
          lineNumber,
          'multiple-entries',
          'Put each entry in a separate changeset file.',
        );
      }
      entry.description += `\n${line}`;
      continue;
    }

    if (category) {
      if (TOP_LEVEL_BULLET_PATTERN.test(line)) {
        const description = line.slice(1).replace(/^[ \t]+/u, '');
        if (description === '') {
          throw new GrammarError(
            'The top-level bullet must contain non-empty entry text.',
            lineNumber,
            'empty-entry',
            'Add entry text after `-`.',
          );
        }
        entry = { category, description };
        continue;
      }
      throw new GrammarError(
        'The category heading must be followed by one top-level bullet.',
        lineNumber,
        'missing-entry',
        'Add exactly one top-level bullet.',
      );
    }

    if (!HEADING_LINE_PATTERN.test(line)) {
      throw new GrammarError(
        'The summary must start with a level-two category heading.',
        lineNumber,
        'missing-heading',
        `Start with a level-two heading such as ${formatList(
          CATEGORIES.map((name) => `\`## ${name}\``),
        )}.`,
      );
    }

    if (!LEVEL_TWO_HEADING_PATTERN.test(line)) {
      throw new GrammarError(
        'The category heading must use exactly two leading hashes.',
        lineNumber,
        'malformed-heading',
        'Use a level-two heading such as `## Added`.',
      );
    }

    const headingMatch = line.match(HEADING_PATTERN);
    const canonicalCategory = CATEGORIES.find(
      (candidate) =>
        candidate.toLowerCase() === headingMatch?.[1].toLowerCase(),
    );
    if (!canonicalCategory) {
      throw new GrammarError(
        'The category heading must name a supported category.',
        lineNumber,
        'unknown-category',
        `Use ${formatList(CATEGORIES.map((name) => `\`${name}\``))} as the category.`,
      );
    }

    category = canonicalCategory;
    headingLine = lineNumber;
  }

  if (!entry) {
    if (category) {
      throw new GrammarError(
        'The category heading must be followed by one top-level bullet.',
        headingLine,
        'missing-entry',
        'Add exactly one top-level bullet.',
      );
    }
    throw new GrammarError(
      'The changeset summary is empty.',
      1,
      'empty-summary',
      'Add a category heading and one entry bullet.',
    );
  }

  return entry;
}
