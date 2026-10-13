import { describe, expect, it } from 'vitest';

import { GrammarError } from './grammar-error.js';
import { parseChangesetSummary } from './parse-changeset-summary.js';

function getThrownError(fn: () => unknown): GrammarError {
  let thrownError: unknown;
  try {
    fn();
  } catch (error) {
    thrownError = error;
  }
  expect(thrownError).toBeInstanceOf(GrammarError);
  return thrownError as GrammarError;
}

describe('parseChangesetSummary', () => {
  it('parses every supported category in canonical spelling', () => {
    expect(parseChangesetSummary('## Added\n\n- New command')).toStrictEqual({
      category: 'Added',
      description: 'New command',
    });
    expect(parseChangesetSummary('## Changed\n\n- Updated API')).toStrictEqual({
      category: 'Changed',
      description: 'Updated API',
    });
    expect(parseChangesetSummary('## Removed\n\n- Old command')).toStrictEqual({
      category: 'Removed',
      description: 'Old command',
    });
    expect(parseChangesetSummary('## Fixed\n\n- Corrected bug')).toStrictEqual({
      category: 'Fixed',
      description: 'Corrected bug',
    });
    expect(
      parseChangesetSummary('## Security\n\n- Patched leak'),
    ).toStrictEqual({ category: 'Security', description: 'Patched leak' });
    expect(
      parseChangesetSummary('## Deprecated\n\n- Replaced API'),
    ).toStrictEqual({ category: 'Deprecated', description: 'Replaced API' });
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
    ['empty summary', '', 1, 'empty-summary'],
    ['blank summary', ' \n\t', 1, 'empty-summary'],
    ['missing heading', 'Add the thing\n\n- New command', 1, 'missing-heading'],
    [
      'unknown category',
      '## Uncategorized\n\n- New command',
      1,
      'unknown-category',
    ],
    [
      'unknown category with suffix',
      '## Added extra\n\n- New command',
      1,
      'unknown-category',
    ],
    [
      'malformed heading above level two',
      '# Added\n\n- New command',
      1,
      'malformed-heading',
    ],
    [
      'malformed heading below level two',
      '### Added\n\n- New command',
      1,
      'malformed-heading',
    ],
    ['missing entry', '## Added', 1, 'missing-entry'],
    [
      'missing bullet',
      '## Added\n\nDescribe the entry in prose.',
      3,
      'missing-entry',
    ],
    ['empty entry', '## Added\n\n-', 3, 'empty-entry'],
    [
      'multiple entries',
      '## Added\n\n- First\n- Second',
      4,
      'multiple-entries',
    ],
    [
      'multiple headings before the entry',
      '## Added\n## Fixed',
      2,
      'multiple-headings',
    ],
    [
      'multiple headings after the entry',
      '## Added\n\n- First\n\n## Fixed',
      5,
      'multiple-headings',
    ],
  ])('throws GrammarError for %s', (_name, summary, line, rule) => {
    const error = getThrownError(() => parseChangesetSummary(summary));
    expect(error).toMatchObject({ line, rule });
    expect(error.hint).not.toBe('');
  });
});
