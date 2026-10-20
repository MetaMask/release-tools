import { CATEGORIES } from '@metamask/changesets-utils';
import { describe, expect, it } from 'vitest';

import { validateChangesetFile } from './validate-changeset-file.js';

const path = '.changeset/example.md';
const workspacePackageNames = new Set(['@metamask/example', '@metamask/other']);

function changeset(frontmatter: string, summary: string): string {
  return `---\n${frontmatter}\n---\n\n${summary}`;
}

describe('validateChangesetFile', () => {
  it.each(['major', 'minor', 'patch'])(
    'accepts a valid %s bump',
    (bumpType) => {
      expect(
        validateChangesetFile({
          path,
          contents: changeset(
            `'@metamask/example': ${bumpType}`,
            '## Added\n\n- Add an example',
          ),
          workspacePackageNames,
        }),
      ).toStrictEqual([]);
    },
  );

  it('accepts multiple package changes', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/example': minor\n'@metamask/other': patch",
          '## Changed\n- Change both packages',
        ),
        workspacePackageNames,
      }),
    ).toStrictEqual([]);
  });

  it.each(CATEGORIES)('accepts the %s category', (category) => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/example': patch",
          `## ${category}\n- Describe the change`,
        ),
        workspacePackageNames,
      }),
    ).toStrictEqual([]);
  });

  it('accepts case-insensitive categories, nested bullets, continuations, and breaking text', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/example': major",
          '## changed\n\n- **BREAKING:** Change the API\n  - Remove the old API\n  More detail',
        ),
        workspacePackageNames,
      }),
    ).toStrictEqual([]);
  });

  it('reports missing package changes', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset('', '## Added\n- Add an example'),
        workspacePackageNames,
      }),
    ).toContainEqual(
      expect.objectContaining({ path, rule: 'missing-package-changes' }),
    );
  });

  it('reports an unknown package', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/unknown': patch",
          '## Added\n- Add an example',
        ),
        workspacePackageNames,
      }),
    ).toContainEqual(
      expect.objectContaining({
        path,
        rule: 'unknown-package',
        packageName: '@metamask/unknown',
      }),
    );
  });

  it.each(['none', 'invalid'])(
    'reports the unsupported %s bump',
    (bumpType) => {
      expect(
        validateChangesetFile({
          path,
          contents: changeset(
            `'@metamask/example': ${bumpType}`,
            '## Added\n- Add an example',
          ),
          workspacePackageNames,
        }),
      ).toContainEqual(
        expect.objectContaining({
          path,
          rule: 'invalid-bump-type',
          packageName: '@metamask/example',
          bumpType,
        }),
      );
    },
  );

  it('reports a non-string bump', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/example': 1",
          '## Added\n- Add an example',
        ),
        workspacePackageNames,
      }),
    ).toContainEqual(
      expect.objectContaining({
        path,
        rule: 'invalid-bump-type',
        packageName: '@metamask/example',
        bumpType: '1',
      }),
    );
  });

  it.each<[string, string, string]>([
    ['missing heading', '- CHANGED: Old grammar', 'missing-heading'],
    ['wrong heading level', '# Added\n- Add an example', 'malformed-heading'],
    [
      'unsupported category',
      '## Uncategorized\n- Add an example',
      'unknown-category',
    ],
    ['missing entry', '## Added', 'missing-entry'],
    ['empty entry', '## Added\n-', 'empty-entry'],
    [
      'multiple entries',
      '## Added\n- First entry\n- Second entry',
      'multiple-entries',
    ],
    [
      'multiple headings',
      '## Added\n- First entry\n## Fixed\nMore',
      'multiple-headings',
    ],
  ])('reports %s summary grammar', (_name, summary, rule) => {
    const diagnostic = validateChangesetFile({
      path,
      contents: changeset("'@metamask/example': patch", summary),
      workspacePackageNames,
    }).find((item) => item.rule === rule);

    expect(diagnostic).toStrictEqual(expect.objectContaining({ path, rule }));
    expect(typeof diagnostic?.hint).toBe('string');
  });

  it('converts summary-relative GrammarError lines to file lines', () => {
    expect(
      validateChangesetFile({
        path,
        contents: changeset(
          "'@metamask/example': patch",
          '## Added\n\n- First entry\n- Second entry',
        ),
        workspacePackageNames,
      }),
    ).toContainEqual(
      expect.objectContaining({
        path,
        line: 8,
        rule: 'multiple-entries',
        hint: 'Put each entry in a separate changeset file.',
      }),
    );
  });

  it('reports frontmatter and summary errors together', () => {
    const diagnostics = validateChangesetFile({
      path,
      contents: changeset(
        "'@metamask/example': patch\n'@metamask/broken': [",
        '- CHANGED: Old grammar',
      ),
      workspacePackageNames,
    });

    expect(diagnostics).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ path, rule: 'invalid-yaml' }),
        expect.objectContaining({ path, rule: 'missing-heading' }),
      ]),
    );
  });
});
