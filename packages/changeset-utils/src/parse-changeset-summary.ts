import type { GrammarError } from './grammar-error.js';
import { grammarError } from './grammar-error.js';

export type ChangesetCategory = 'ADDED' | 'CHANGED' | 'REMOVED' | 'FIXED';

export type ParsedEntry = {
  category: ChangesetCategory;
  breaking: boolean;
  description: string;
};

const categories = ['added', 'changed', 'removed', 'fixed'];
const headerPattern = /^(added|changed|removed|fixed)(!)?:[ \t]*(\S.*)?$/u;

/**
 * Parses categorized entries from a changeset summary.
 *
 * Blank lines separate entries. Each entry starts with a lowercase header such
 * as `changed: Rename the API`, where an optional `!` before the colon marks a
 * breaking change. Every other non-blank line extends the entry description.
 *
 * @param summary - The Markdown summary to parse.
 * @returns The parsed entries in source order.
 * @throws {GrammarError} If the summary does not follow the supported grammar.
 */
export function parseChangesetSummary(summary: string): ParsedEntry[] {
  const lines = summary.split(/\r?\n/u);
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | undefined;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      current = undefined;
      continue;
    }

    const headerMatch = line.match(headerPattern);
    if (current) {
      if (headerMatch) {
        throw grammarError(
          lineNumber,
          'missing-blank-line',
          'Separate entries with an empty line.',
          'A changeset entry must be separated from the previous entry by a blank line.',
        );
      }
      current.description += `\n${line}`;
      continue;
    }

    if (!headerMatch) {
      throw invalidHeaderError(line, lineNumber);
    }

    const [, category, breakingMarker, description] = headerMatch;
    if (!description) {
      throw grammarError(
        lineNumber,
        'empty-description',
        'Put description text on the header line.',
        'A changeset entry must have a non-empty description on its header line.',
      );
    }

    current = {
      category: category.toUpperCase() as ChangesetCategory,
      breaking: breakingMarker === '!',
      description,
    };
    entries.push(current);
  }

  if (entries.length === 0) {
    throw grammarError(
      1,
      'empty-summary',
      'Add at least one entry.',
      'The changeset summary is empty.',
    );
  }

  return entries;
}

/**
 * Classifies an entry header that does not match the header pattern.
 *
 * @param line - The offending header line, with trailing whitespace removed.
 * @param lineNumber - The 1-based line number of the header in the summary.
 * @returns The grammar error describing why the header is invalid.
 */
function invalidHeaderError(line: string, lineNumber: number): GrammarError {
  const categoryMatch = line.match(/^([A-Za-z]+)[ \t]*(?:!)?[ \t]*:/u);
  if (categoryMatch) {
    if (categories.includes(categoryMatch[1].toLowerCase())) {
      return grammarError(
        lineNumber,
        'malformed-header',
        'Use a lowercase header in the form changed: or changed!:.',
        'The changeset entry header is malformed.',
      );
    }
    return grammarError(
      lineNumber,
      'unknown-category',
      'Use added, changed, removed, or fixed as the category.',
      `Unknown changeset category: ${categoryMatch[1]}.`,
    );
  }

  return grammarError(
    lineNumber,
    'missing-category',
    'Start the entry with added:, changed:, removed:, or fixed:.',
    'A changeset entry must start with a supported category.',
  );
}
