import { describe, expect, it } from 'vitest';

import { GrammarError } from './grammar-error.js';
import { parseChangesetSummary } from './parse-changeset-summary.js';

describe('parseChangesetSummary', () => {
  it.each([
    ['Added', 'New command'],
    ['Changed', 'Updated API'],
    ['Removed', 'Old command'],
    ['Fixed', 'Corrected bug'],
    ['Security', 'Patched leak'],
    ['Deprecated', 'Replaced API'],
  ])('parses the %s category', (category, description) => {
    expect(
      parseChangesetSummary(`## ${category}\n\n- ${description}`),
    ).toStrictEqual({ category, description });
  });

  it('normalizes heading case variants to the canonical spelling', () => {
    expect(parseChangesetSummary('## added\n\n- New command')).toStrictEqual({
      category: 'Added',
      description: 'New command',
    });
    expect(parseChangesetSummary('## FIXED\n\n- Corrected bug')).toStrictEqual({
      category: 'Fixed',
      description: 'Corrected bug',
    });
  });

  it('preserves sub-bullets and plain continuation lines', () => {
    expect(
      parseChangesetSummary(
        '## Changed\n\n- Rename `get-client` to `get-network-client`\n  - The old method is no longer available\nCallers must migrate.',
      ),
    ).toStrictEqual({
      category: 'Changed',
      description:
        'Rename `get-client` to `get-network-client`\n  - The old method is no longer available\nCallers must migrate.',
    });
  });

  it('tolerates leading, trailing, and in-between blank lines', () => {
    expect(
      parseChangesetSummary(
        ' \r\n\r\n## Fixed\r\n\r\n\r\n- Correct RPC ordering  \r\nRequests stop after rejection.\t\r\n \r\n\r\n',
      ),
    ).toStrictEqual({
      category: 'Fixed',
      description: 'Correct RPC ordering\nRequests stop after rejection.',
    });
  });

  it.each([
    [
      'empty summary',
      '',
      new GrammarError(
        'The changeset summary is empty.',
        1,
        'empty-summary',
        'Add a category heading and one entry bullet.',
      ),
    ],
    [
      'blank summary',
      ' \n\t',
      new GrammarError(
        'The changeset summary is empty.',
        1,
        'empty-summary',
        'Add a category heading and one entry bullet.',
      ),
    ],
    [
      'missing heading',
      'Add the thing\n\n- New command',
      new GrammarError(
        'The summary must start with a level-two category heading.',
        1,
        'missing-heading',
        'Start with a level-two heading such as `## Added`, `## Changed`, `## Removed`, `## Fixed`, `## Security`, or `## Deprecated`.',
      ),
    ],
    [
      'unknown category',
      '## Uncategorized\n\n- New command',
      new GrammarError(
        'The category heading must name a supported category.',
        1,
        'unknown-category',
        'Use `Added`, `Changed`, `Removed`, `Fixed`, `Security`, or `Deprecated` as the category.',
      ),
    ],
    [
      'unknown category with suffix',
      '## Added extra\n\n- New command',
      new GrammarError(
        'The category heading must name a supported category.',
        1,
        'unknown-category',
        'Use `Added`, `Changed`, `Removed`, `Fixed`, `Security`, or `Deprecated` as the category.',
      ),
    ],
    [
      'malformed heading above level two',
      '# Added\n\n- New command',
      new GrammarError(
        'The category heading must use exactly two leading hashes.',
        1,
        'malformed-heading',
        'Use a level-two heading such as `## Added`.',
      ),
    ],
    [
      'malformed heading below level two',
      '### Added\n\n- New command',
      new GrammarError(
        'The category heading must use exactly two leading hashes.',
        1,
        'malformed-heading',
        'Use a level-two heading such as `## Added`.',
      ),
    ],
    [
      'missing entry',
      '## Added',
      new GrammarError(
        'The category heading must be followed by one top-level bullet.',
        1,
        'missing-entry',
        'Add exactly one top-level bullet.',
      ),
    ],
    [
      'missing bullet',
      '## Added\n\nDescribe the entry in prose.',
      new GrammarError(
        'The category heading must be followed by one top-level bullet.',
        3,
        'missing-entry',
        'Add exactly one top-level bullet.',
      ),
    ],
    [
      'empty entry',
      '## Added\n\n-',
      new GrammarError(
        'The top-level bullet must contain non-empty entry text.',
        3,
        'empty-entry',
        'Add entry text after `-`.',
      ),
    ],
    [
      'multiple entries',
      '## Added\n\n- First\n- Second',
      new GrammarError(
        'A changeset summary must contain exactly one top-level bullet.',
        4,
        'multiple-entries',
        'Put each entry in a separate changeset file.',
      ),
    ],
    [
      'multiple headings before the entry',
      '## Added\n## Fixed',
      new GrammarError(
        'A changeset summary must contain exactly one category heading.',
        2,
        'multiple-headings',
        'Put each entry in a separate changeset file.',
      ),
    ],
    [
      'multiple headings after the entry',
      '## Added\n\n- First\n\n## Fixed',
      new GrammarError(
        'A changeset summary must contain exactly one category heading.',
        5,
        'multiple-headings',
        'Put each entry in a separate changeset file.',
      ),
    ],
  ])('throws GrammarError for %s', (_name, summary, expectedError) => {
    expect(() => parseChangesetSummary(summary)).toThrow(expectedError);
  });
});
