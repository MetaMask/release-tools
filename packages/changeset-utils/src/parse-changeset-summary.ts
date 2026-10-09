export type ChangesetCategory = 'ADDED' | 'CHANGED' | 'REMOVED' | 'FIXED';

export type ParsedEntry = {
  category: ChangesetCategory;
  breaking: boolean;
  description: string;
};

export class GrammarError extends Error {
  readonly line: number;

  readonly rule: string;

  readonly hint: string;

  constructor(message: string, line: number, rule: string, hint: string) {
    super(message);
    this.name = 'GrammarError';
    this.line = line;
    this.rule = rule;
    this.hint = hint;
  }
}

const categories = new Set<ChangesetCategory>([
  'ADDED',
  'CHANGED',
  'REMOVED',
  'FIXED',
]);
const categoryPattern = /^([A-Z]+)\s*:\s*(.*)$/u;
const breakingMarker = /^\*\*BREAKING:\*\*\s*(.*)$/u;

function grammarError(
  line: number,
  rule: string,
  hint: string,
  message: string,
): GrammarError {
  return new GrammarError(message, line, rule, hint);
}

function isTopLevelBullet(line: string): boolean {
  return /^-\s+/u.test(line);
}

/**
 * Parses categorized top-level bullets from a changeset summary.
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
      continue;
    }

    if (isTopLevelBullet(line)) {
      const content = line.replace(/^\s*-\s+/u, '');
      const categoryMatch = content.match(categoryPattern);
      if (content.startsWith('**BREAKING')) {
        throw grammarError(
          lineNumber,
          'malformed-breaking-marker',
          'Place **BREAKING:** immediately after the category prefix.',
          'The BREAKING marker is malformed or misplaced.',
        );
      }
      if (!categoryMatch) {
        throw grammarError(
          lineNumber,
          'missing-category',
          'Start the bullet with ADDED, CHANGED, REMOVED, or FIXED followed by a colon.',
          'A top-level bullet must have a supported category prefix.',
        );
      }

      const [, categoryText, categoryContent] = categoryMatch;
      if (!categories.has(categoryText as ChangesetCategory)) {
        throw grammarError(
          lineNumber,
          'unknown-category',
          'Use ADDED, CHANGED, REMOVED, or FIXED as the category.',
          `Unknown changeset category: ${categoryText}.`,
        );
      }

      if (categoryContent.includes('**BREAKING')) {
        const breakingMatch = categoryContent.match(breakingMarker);
        if (!breakingMatch) {
          throw grammarError(
            lineNumber,
            'malformed-breaking-marker',
            'Place **BREAKING:** immediately after the category prefix.',
            'The BREAKING marker is malformed or misplaced.',
          );
        }
      }

      const breakingMatch = categoryContent.match(breakingMarker);
      const description = (breakingMatch?.[1] ?? categoryContent).trim();
      if (description === '') {
        throw grammarError(
          lineNumber,
          'empty-description',
          'Add a description after the category prefix.',
          'A changeset entry must have a non-empty description.',
        );
      }

      current = {
        category: categoryText as ChangesetCategory,
        breaking: breakingMatch !== null,
        description,
      };
      entries.push(current);
      continue;
    }

    if (current && /^\s+-\s+/u.test(line)) {
      current.description += `\n${line}`;
      continue;
    }

    throw grammarError(
      lineNumber,
      'non-bullet-content',
      'Use a top-level bullet for each entry and indent nested bullets below their parent.',
      'Summary content must be a bullet or a nested bullet.',
    );
  }

  if (entries.length === 0) {
    throw grammarError(
      1,
      'empty-summary',
      'Add at least one categorized bullet to the summary.',
      'The changeset summary is empty.',
    );
  }

  return entries;
}
