import type {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import { describe, expect, it } from 'vitest';

import {
  generateMarkdownForVersionType,
  getChangelogEntry,
  isCustomCategoryChangelogFunctions,
  validateCustomCategoryChangelogFunctions,
} from './get-changelog-entry.js';
import type { CustomCategoryChangelogFunctions } from './types.js';

const baseChangelogFunctions: ChangelogFunctions = {
  getReleaseLine: async () => '',
  getDependencyReleaseLine: async () => '',
};

const customCategoryChangelogFunctions: CustomCategoryChangelogFunctions = {
  ...baseChangelogFunctions,
  categorizeReleaseLine: async () => [],
  categorizeDependencyReleaseLine: async () => [],
  categories: ['Added'],
};

describe('isCustomCategoryChangelogFunctions', () => {
  it('returns true when categorizeReleaseLine is a function', () => {
    expect(
      isCustomCategoryChangelogFunctions(customCategoryChangelogFunctions),
    ).toBe(true);
  });

  it('returns false when categorizeReleaseLine is absent', () => {
    expect(isCustomCategoryChangelogFunctions(baseChangelogFunctions)).toBe(
      false,
    );
  });

  it('returns false when categorizeReleaseLine is not a function', () => {
    const misconfigured = {
      ...baseChangelogFunctions,
      categorizeReleaseLine: 'not a function',
    };

    expect(isCustomCategoryChangelogFunctions(misconfigured)).toBe(false);
  });
});

describe('validateCustomCategoryChangelogFunctions', () => {
  it('returns the categories trimmed and deduplicated by first occurrence', () => {
    expect(
      validateCustomCategoryChangelogFunctions({
        ...customCategoryChangelogFunctions,
        categories: [' Added ', 'Changed', 'Added'],
      }),
    ).toStrictEqual(['Added', 'Changed']);
  });

  it('throws when categorizeDependencyReleaseLine is missing', () => {
    const {
      categorizeDependencyReleaseLine: _categorizeDependencyReleaseLine,
      ...incompleteFunctions
    } = customCategoryChangelogFunctions;

    expect(() =>
      validateCustomCategoryChangelogFunctions(
        incompleteFunctions as CustomCategoryChangelogFunctions,
      ),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  });

  it('throws when categories is missing or empty', () => {
    const { categories: _categories, ...incompleteFunctions } =
      customCategoryChangelogFunctions;

    expect(() =>
      validateCustomCategoryChangelogFunctions(
        incompleteFunctions as CustomCategoryChangelogFunctions,
      ),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );

    expect(() =>
      validateCustomCategoryChangelogFunctions({
        ...customCategoryChangelogFunctions,
        categories: [],
      }),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  });

  it('throws when a category is empty or whitespace-only', () => {
    expect(() =>
      validateCustomCategoryChangelogFunctions({
        ...customCategoryChangelogFunctions,
        categories: ['Added', '   '],
      }),
    ).toThrow(
      'Changelog module categories must be a non-empty array of non-empty strings',
    );
  });
});

describe('generateMarkdownForVersionType', () => {
  it('returns undefined when there are empty lines', () => {
    expect(generateMarkdownForVersionType('patch', ['', ''])).toBeUndefined();
  });

  it('returns proper heading based on version type', () => {
    expect.soft(generateMarkdownForVersionType('major', ['- something']))
      .toMatchInlineSnapshot(`
      "### Major Changes

      - something"
    `);
    expect.soft(generateMarkdownForVersionType('minor', ['- something']))
      .toMatchInlineSnapshot(`
      "### Minor Changes

      - something"
    `);
    expect.soft(generateMarkdownForVersionType('patch', ['- something']))
      .toMatchInlineSnapshot(`
      "### Patch Changes

      - something"
    `);
  });

  it('trims surrounding whitespace from release lines', () => {
    expect(generateMarkdownForVersionType('minor', ['\n  - something  \n']))
      .toMatchInlineSnapshot(`
      "### Minor Changes

      - something"
    `);
  });

  it('keeps preferred spacing between entries clamped between one and two new lines', () => {
    expect(
      generateMarkdownForVersionType('patch', [
        'trimmed',
        '\nleading one',
        '\n\nleading two',
        '\n\n\nleading three',
        'trailing one\n',
        'trailing two\n\n',
        'trailing three\n\n\n',
        '\nmixed one\n',
        '\n\nmixed two\n\n',
        '\n\n\nmixed three\n\n\n',
      ]),
    ).toMatchInlineSnapshot(`
      "### Patch Changes

      trimmed
      leading one

      leading two

      leading three
      trailing one
      trailing two

      trailing three

      mixed one

      mixed two

      mixed three"
    `);
  });
});

describe('getChangelogEntry', () => {
  const dependencyUpdateConfig = {
    updateInternalDependencies: 'patch',
    onlyUpdatePeerDependentsWhenOutOfRange: false,
  } as const;

  const standardChangelogFunctions: ChangelogFunctions = {
    getReleaseLine: async (changeset) => `- ${changeset.summary}`,
    getDependencyReleaseLine: async (_changesets, dependenciesUpdated) =>
      dependenciesUpdated
        .map(
          (dependency) =>
            `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
        )
        .join('\n'),
  };

  const categorizedChangelogFunctions: CustomCategoryChangelogFunctions = {
    getReleaseLine: async (changeset) => `- ${changeset.summary}`,
    getDependencyReleaseLine: async (_changesets, dependenciesUpdated) =>
      dependenciesUpdated
        .map(
          (dependency) =>
            `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
        )
        .join('\n'),
    categorizeReleaseLine: async (line) => [{ category: 'Added', line }],
    categorizeDependencyReleaseLine: async (line) => [
      { category: 'Changed', line },
    ],
    categories: ['Added', 'Changed'],
  };

  it('returns null for a release whose type is none', async () => {
    const release: ModCompWithPackage = {
      name: 'pkg-a',
      type: 'none',
      oldVersion: '1.0.0',
      newVersion: '1.0.0',
      changesets: [],
      packageJson: { name: 'pkg-a', version: '1.0.0' },
      dir: '/virtual/pkg-a',
    };

    const entry = await getChangelogEntry(
      '/virtual',
      release,
      [release],
      [],
      standardChangelogFunctions,
      null,
      dependencyUpdateConfig,
    );

    expect(entry).toBeNull();
  });

  it('renders a standard entry with the default version heading', async () => {
    const release: ModCompWithPackage = {
      name: 'pkg-a',
      type: 'minor',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      changesets: ['quick-lions-devour'],
      packageJson: { name: 'pkg-a', version: '1.0.0' },
      dir: '/virtual/pkg-a',
    };
    const changeset: NewChangesetWithCommit = {
      id: 'quick-lions-devour',
      summary: 'A new feature',
      releases: [{ name: 'pkg-a', type: 'minor' }],
    };

    const entry = await getChangelogEntry(
      '/virtual',
      release,
      [release],
      [changeset],
      standardChangelogFunctions,
      null,
      dependencyUpdateConfig,
    );

    expect(entry).toBe('## 1.1.0\n\n### Minor Changes\n\n- A new feature');
  });

  it('includes the dependency release line in a standard entry', async () => {
    const release: ModCompWithPackage = {
      name: 'pkg-a',
      type: 'patch',
      oldVersion: '1.0.0',
      newVersion: '1.0.1',
      changesets: [],
      packageJson: {
        name: 'pkg-a',
        version: '1.0.0',
        dependencies: { 'pkg-b': '^1.0.0' },
      },
      dir: '/virtual/pkg-a',
    };
    const dependencyRelease: ModCompWithPackage = {
      name: 'pkg-b',
      type: 'minor',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      changesets: ['spring-roses-see'],
      packageJson: { name: 'pkg-b', version: '1.0.0' },
      dir: '/virtual/pkg-b',
    };
    const changeset: NewChangesetWithCommit = {
      id: 'spring-roses-see',
      summary: 'A new feature in `pkg-b`',
      releases: [{ name: 'pkg-b', type: 'minor' }],
    };

    const entry = await getChangelogEntry(
      '/virtual',
      release,
      [release, dependencyRelease],
      [changeset],
      standardChangelogFunctions,
      null,
      dependencyUpdateConfig,
    );

    expect(entry).toBe(
      '## 1.0.1\n\n### Patch Changes\n\n- Bump `pkg-b` to `1.1.0`',
    );
  });

  it('renders a categorized entry with sections in declared category order', async () => {
    const release: ModCompWithPackage = {
      name: 'pkg-a',
      type: 'minor',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      changesets: ['quick-lions-devour'],
      packageJson: { name: 'pkg-a', version: '1.0.0' },
      dir: '/virtual/pkg-a',
    };
    const changeset: NewChangesetWithCommit = {
      id: 'quick-lions-devour',
      summary: 'A new feature',
      releases: [{ name: 'pkg-a', type: 'minor' }],
    };

    const entry = await getChangelogEntry(
      '/virtual',
      release,
      [release],
      [changeset],
      categorizedChangelogFunctions,
      null,
      dependencyUpdateConfig,
    );

    expect(entry).toBe('## 1.1.0\n\n### Added\n\n- A new feature');
  });

  it('renders the categorized dependency release line in its category', async () => {
    const release: ModCompWithPackage = {
      name: 'pkg-a',
      type: 'patch',
      oldVersion: '1.0.0',
      newVersion: '1.0.1',
      changesets: [],
      packageJson: {
        name: 'pkg-a',
        version: '1.0.0',
        dependencies: { 'pkg-b': '^1.0.0' },
      },
      dir: '/virtual/pkg-a',
    };
    const dependencyRelease: ModCompWithPackage = {
      name: 'pkg-b',
      type: 'minor',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      changesets: ['spring-roses-see'],
      packageJson: { name: 'pkg-b', version: '1.0.0' },
      dir: '/virtual/pkg-b',
    };
    const changeset: NewChangesetWithCommit = {
      id: 'spring-roses-see',
      summary: 'A new feature in `pkg-b`',
      releases: [{ name: 'pkg-b', type: 'minor' }],
    };

    const entry = await getChangelogEntry(
      '/virtual',
      release,
      [release, dependencyRelease],
      [changeset],
      categorizedChangelogFunctions,
      null,
      dependencyUpdateConfig,
    );

    expect(entry).toBe('## 1.0.1\n\n### Changed\n\n- Bump `pkg-b` to `1.1.0`');
  });
});
