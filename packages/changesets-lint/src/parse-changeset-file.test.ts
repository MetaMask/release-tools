import { describe, expect, it } from 'vitest';

import { parseChangesetFile } from './parse-changeset-file.js';

describe('parseChangesetFile', () => {
  it('reports missing frontmatter for an empty file', () => {
    expect(parseChangesetFile('')).toStrictEqual(
      expect.objectContaining({
        summary: '',
        summaryStartLine: 1,
        diagnostics: [
          expect.objectContaining({ rule: 'missing-frontmatter', line: 1 }),
        ],
      }),
    );
  });

  it.each([
    ['indented delimiters', "  ---\n'@metamask/example': patch\n  ---"],
    ['a byte order mark', "\uFEFF---\n'@metamask/example': patch\n---"],
  ])('parses frontmatter with %s', (_name, frontmatter) => {
    const result = parseChangesetFile(
      `${frontmatter}\n## Fixed\n- Fix an example`,
    );

    expect(result).toStrictEqual(
      expect.objectContaining({
        packageChanges: [
          { packageName: '@metamask/example', bumpType: 'patch' },
        ],
        summary: '## Fixed\n- Fix an example',
        compatibleWithChangesetsParser: true,
      }),
    );
  });

  it.each(['\n', '\r\n'])('parses a valid file with %j newlines', (newline) => {
    const result = parseChangesetFile(
      [
        '---',
        "'@metamask/example': minor",
        '---',
        '',
        '## Added',
        '',
        '- Add an example',
      ].join(newline),
    );

    expect(result).toStrictEqual({
      packageChanges: [{ packageName: '@metamask/example', bumpType: 'minor' }],
      summary: '## Added\n\n- Add an example',
      summaryStartLine: 5,
      diagnostics: [],
      compatibleWithChangesetsParser: true,
    });
  });

  it('reports missing frontmatter delimiters and preserves the summary', () => {
    const result = parseChangesetFile('## Added\n\n- Add an example');

    expect(result.summary).toBe('## Added\n\n- Add an example');
    expect(result.summaryStartLine).toBe(1);
    expect(result.compatibleWithChangesetsParser).toBe(false);
    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'missing-frontmatter' }),
    ]);
  });

  it('reports an unclosed frontmatter block', () => {
    const result = parseChangesetFile(
      "---\n'@metamask/example': patch\n## Fixed\n\n- Fix an example",
    );

    expect(result.packageChanges).toStrictEqual([]);
    expect(result.summary).toBe('');
    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'missing-frontmatter-end', line: 1 }),
    ]);
  });

  it('recovers the summary and valid entries from malformed YAML', () => {
    const result = parseChangesetFile(
      [
        '---',
        "'@metamask/example': patch",
        "'@metamask/broken': [",
        '---',
        '',
        '## Fixed',
        '',
        '- Fix an example',
      ].join('\n'),
    );

    expect(result.summary).toBe('## Fixed\n\n- Fix an example');
    expect(result.summaryStartLine).toBe(6);
    expect(result.packageChanges).toContainEqual({
      packageName: '@metamask/example',
      bumpType: 'patch',
    });
    expect(result.compatibleWithChangesetsParser).toBe(false);
    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'invalid-yaml', line: 3 }),
    ]);
  });

  it('reports stray content before the frontmatter that the Changesets parser accepts', () => {
    const result = parseChangesetFile(
      [
        'Stray prose',
        '---',
        "'@metamask/example': patch",
        '---',
        '',
        '## Added',
        '',
        '- Add an example',
      ].join('\n'),
    );

    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'missing-frontmatter' }),
    ]);
    expect(result.compatibleWithChangesetsParser).toBe(true);
  });

  it('includes leading blank lines in YAML diagnostic locations', () => {
    const result = parseChangesetFile(
      [
        '',
        '---',
        "'@metamask/broken': [",
        '---',
        '## Fixed',
        '- Fix an example',
      ].join('\n'),
    );

    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'invalid-yaml', line: 3 }),
    ]);
  });

  it('reports duplicate package keys', () => {
    const result = parseChangesetFile(
      [
        '---',
        "'@metamask/example': patch",
        "'@metamask/example': minor",
        '---',
        '## Changed',
        '- Change an example',
      ].join('\n'),
    );

    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'invalid-yaml', line: 3 }),
    ]);
  });

  it.each(['value', '- item'])(
    'reports non-mapping frontmatter: %s',
    (yaml) => {
      const result = parseChangesetFile(
        ['---', yaml, '---', '## Added', '- Add an example'].join('\n'),
      );

      expect(result.packageChanges).toStrictEqual([]);
      expect(result.diagnostics).toStrictEqual([
        expect.objectContaining({ rule: 'invalid-frontmatter' }),
      ]);
    },
  );

  it('accepts empty frontmatter for later validation', () => {
    const result = parseChangesetFile(
      ['---', '---', '## Added', '- Add an example'].join('\n'),
    );

    expect(result.packageChanges).toStrictEqual([]);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.compatibleWithChangesetsParser).toBe(true);
  });

  it('recovers a file without summary content', () => {
    const result = parseChangesetFile("---\n'@metamask/example': patch\n---");

    expect(result.summary).toBe('');
    expect(result.summaryStartLine).toBe(4);
  });

  it('recovers non-string frontmatter keys as package names', () => {
    const result = parseChangesetFile(
      ['---', '1: patch', '---', '## Added', '- Add an example'].join('\n'),
    );

    expect(result.packageChanges).toStrictEqual([
      { packageName: '1', bumpType: 'patch' },
    ]);
  });

  it('recovers a null bump value', () => {
    const result = parseChangesetFile(
      [
        '---',
        "'@metamask/example':",
        '---',
        '## Added',
        '- Add an example',
      ].join('\n'),
    );

    expect(result.packageChanges).toStrictEqual([
      { packageName: '@metamask/example', bumpType: null },
    ]);
  });

  it('reports pinned parser incompatibility', () => {
    const result = parseChangesetFile(
      ['---', "'@metamask/example': 1", '---', '## Added', '- Add'].join('\n'),
    );

    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ rule: 'changesets-parser' }),
    ]);
    expect(result.compatibleWithChangesetsParser).toBe(false);
  });
});
