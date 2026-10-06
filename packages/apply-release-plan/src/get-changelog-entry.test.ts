import type { ChangelogFunctions } from '@changesets/types';
import { describe, expect, it } from 'vitest';

import {
  generateMarkdownForVersionType,
  isCustomCategoryChangelogFunctions,
  validateCustomCategoryChangelogFunctions,
} from './get-changelog-entry.js';
import type { CustomCategoryChangelogFunctions } from './types.js';

const baseChangelogFunctions: ChangelogFunctions = {
  getReleaseLine: async () => '',
  getDependencyReleaseLine: async () => '',
};

function asCustomCategoryChangelogFunctions(
  changelogFuncs: unknown,
): CustomCategoryChangelogFunctions {
  return changelogFuncs as CustomCategoryChangelogFunctions;
}

describe('isCustomCategoryChangelogFunctions', () => {
  it('returns true when categorizeReleaseLine is a function', () => {
    expect(
      isCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeReleaseLine: async () => [],
        }),
      ),
    ).toBe(true);
  });

  it('returns false when categorizeReleaseLine is absent', () => {
    expect(isCustomCategoryChangelogFunctions(baseChangelogFunctions)).toBe(
      false,
    );
  });

  it('returns false when categorizeReleaseLine is not a function', () => {
    expect(
      isCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeReleaseLine: 'not a function',
        }),
      ),
    ).toBe(false);
  });
});

describe('validateCustomCategoryChangelogFunctions', () => {
  it('returns the categories trimmed and deduplicated by first occurrence', () => {
    expect(
      validateCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeReleaseLine: async () => [],
          categorizeDependencyReleaseLine: async () => [],
          categories: [' Added ', 'Changed', 'Added'],
        }),
      ),
    ).toStrictEqual(['Added', 'Changed']);
  });

  it('throws when categorizeDependencyReleaseLine is missing', () => {
    expect(() =>
      validateCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categories: ['Added'],
        }),
      ),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  });

  it('throws when categories is missing or empty', () => {
    expect(() =>
      validateCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeDependencyReleaseLine: async () => [],
        }),
      ),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );

    expect(() =>
      validateCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeDependencyReleaseLine: async () => [],
          categories: [],
        }),
      ),
    ).toThrow(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  });

  it('throws when a category is empty or whitespace-only', () => {
    expect(() =>
      validateCustomCategoryChangelogFunctions(
        asCustomCategoryChangelogFunctions({
          ...baseChangelogFunctions,
          categorizeDependencyReleaseLine: async () => [],
          categories: ['Added', '   '],
        }),
      ),
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
