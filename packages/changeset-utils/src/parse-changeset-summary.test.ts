import { describe, expect, it } from 'vitest';

import {
  GrammarError,
  parseChangesetSummary,
} from './parse-changeset-summary.js';

function getThrownError(callback: () => unknown): unknown {
  try {
    return callback();
  } catch (error) {
    return error;
  }
}

describe('parseChangesetSummary', () => {
  it('parses every supported category in source order', () => {
    expect(
      parseChangesetSummary(
        '- ADDED: New command\n- CHANGED: Updated API\n- REMOVED: Old command\n- FIXED: Corrected bug',
      ),
    ).toStrictEqual([
      { category: 'ADDED', breaking: false, description: 'New command' },
      { category: 'CHANGED', breaking: false, description: 'Updated API' },
      { category: 'REMOVED', breaking: false, description: 'Old command' },
      { category: 'FIXED', breaking: false, description: 'Corrected bug' },
    ]);
  });

  it('parses breaking markers and nested bullets', () => {
    expect(
      parseChangesetSummary(
        '- CHANGED: **BREAKING:** Rename `getNetworkClient`\n  - Old name remains as an alias\n  - Update callers',
      ),
    ).toStrictEqual([
      {
        category: 'CHANGED',
        breaking: true,
        description:
          'Rename `getNetworkClient`\n  - Old name remains as an alias\n  - Update callers',
      },
    ]);
  });

  it('tolerates surrounding whitespace and blank lines', () => {
    expect(
      parseChangesetSummary(
        '  \n-   FIXED:   Correct RPC ordering  \r\n\r\n',
      ),
    ).toStrictEqual([
      { category: 'FIXED', breaking: false, description: 'Correct RPC ordering' },
    ]);
  });

  it('allows indented nested bullets after a top-level entry', () => {
    expect(parseChangesetSummary('- FIXED: Fix it\n  - Details')).toStrictEqual([
      {
        category: 'FIXED',
        breaking: false,
        description: 'Fix it\n  - Details',
      },
    ]);
  });

  it.each([
    ['empty summary', '', 1, 'empty-summary'],
    ['blank summary', ' \n\t', 1, 'empty-summary'],
    ['missing category', '- Fix the bug', 1, 'missing-category'],
    ['unknown category', '- SECURITY: Fix an issue', 1, 'unknown-category'],
    ['deprecated category', '- DEPRECATED: Use another API', 1, 'unknown-category'],
    ['empty description', '- FIXED:', 1, 'empty-description'],
    ['non-bullet content', 'A paragraph', 1, 'non-bullet-content'],
    ['malformed marker', '- CHANGED: **BREAKING** Rename the API', 1, 'malformed-breaking-marker'],
    ['marker before category', '- **BREAKING:** CHANGED: Rename the API', 1, 'malformed-breaking-marker'],
    ['marker not immediate', '- CHANGED: Rename **BREAKING:** the API', 1, 'malformed-breaking-marker'],
    ['invalid content after entry', '- FIXED: Fix it\nnot a bullet', 2, 'non-bullet-content'],
  ])('throws GrammarError for %s', (_name, summary, line, rule) => {
    const error = getThrownError(() => parseChangesetSummary(summary));
    expect(error).toBeInstanceOf(GrammarError);
    expect(error).toMatchObject({ line, rule });
    expect((error as GrammarError).hint).not.toBe('');
  });
});
