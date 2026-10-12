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
  it('parses every supported category in source order', () => {
    expect(
      parseChangesetSummary(
        'added: New command\n\nchanged: Updated API\n\nremoved: Old command\n\nfixed: Corrected bug',
      ),
    ).toStrictEqual([
      { category: 'ADDED', breaking: false, description: 'New command' },
      { category: 'CHANGED', breaking: false, description: 'Updated API' },
      { category: 'REMOVED', breaking: false, description: 'Old command' },
      { category: 'FIXED', breaking: false, description: 'Corrected bug' },
    ]);
  });

  it('parses breaking headers and Markdown continuation lines', () => {
    expect(
      parseChangesetSummary(
        'changed!: Rename `getNetworkClient`\nThe old method is no longer available.\n  - Update nested callers',
      ),
    ).toStrictEqual([
      {
        category: 'CHANGED',
        breaking: true,
        description:
          'Rename `getNetworkClient`\nThe old method is no longer available.\n  - Update nested callers',
      },
    ]);
  });

  it('tolerates multiple, leading, and trailing blank lines', () => {
    expect(
      parseChangesetSummary(
        ' \r\n\r\nfixed:\tCorrect RPC ordering  \r\nRequests stop after rejection.\t\r\n \r\n\r\nadded: Add fallback\r\n',
      ),
    ).toStrictEqual([
      {
        category: 'FIXED',
        breaking: false,
        description: 'Correct RPC ordering\nRequests stop after rejection.',
      },
      { category: 'ADDED', breaking: false, description: 'Add fallback' },
    ]);
  });

  it.each([
    ['empty summary', '', 1, 'empty-summary'],
    ['blank summary', ' \n\t', 1, 'empty-summary'],
    ['missing category', '\nDescribe the fix', 2, 'missing-category'],
    ['unknown category', 'security: Fix an issue', 1, 'unknown-category'],
    [
      'deprecated category',
      'deprecated: Use another API',
      1,
      'unknown-category',
    ],
    ['misspelled category', 'chnaged: Rename the API', 1, 'unknown-category'],
    ['uppercase category', 'CHANGED: Rename the API', 1, 'malformed-header'],
    ['space before marker', 'changed !: Rename the API', 1, 'malformed-header'],
    ['space before colon', 'changed : Rename the API', 1, 'malformed-header'],
    ['empty description', 'fixed:', 1, 'empty-description'],
    [
      'empty description before continuation',
      'fixed:\nThis does not supply the header description.',
      1,
      'empty-description',
    ],
    [
      'missing blank line',
      'fixed: Fix it\nchanged!: Rename the API',
      2,
      'missing-blank-line',
    ],
  ])('throws GrammarError for %s', (_name, summary, line, rule) => {
    const error = getThrownError(() => parseChangesetSummary(summary));
    expect(error).toMatchObject({ line, rule });
    expect(error.hint).not.toBe('');
  });
});
