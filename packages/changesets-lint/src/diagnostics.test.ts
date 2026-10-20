import { describe, expect, it } from 'vitest';

import { formatDiagnostic } from './diagnostics.js';

describe('formatDiagnostic', () => {
  it('formats a message without optional details', () => {
    expect(formatDiagnostic({ message: 'Project setup failed.' })).toBe(
      'Project setup failed.',
    );
  });

  it('formats a path and message', () => {
    expect(
      formatDiagnostic({
        path: '.changeset/example.md',
        message: 'The frontmatter is invalid.',
      }),
    ).toBe('.changeset/example.md: The frontmatter is invalid.');
  });

  it('formats all structured details on one line', () => {
    expect(
      formatDiagnostic({
        path: '.changeset/example.md',
        line: 6,
        rule: 'unknown-category',
        packageName: '@metamask/example',
        bumpType: 'invalid',
        message: 'Unsupported\ncategory.',
        hint: 'Use Added\nor Fixed.',
      }),
    ).toBe(
      '.changeset/example.md:6 [unknown-category] [package: @metamask/example] [bump: invalid]: Unsupported category. Hint: Use Added or Fixed.',
    );
  });
});
