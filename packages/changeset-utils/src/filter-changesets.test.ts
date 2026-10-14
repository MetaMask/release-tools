import type { NewChangesetWithCommit } from '@changesets/types';
import { describe, expect, it } from 'vitest';

import { filterChangesets } from './filter-changesets.js';

describe('filterChangesets', () => {
  it('accepts readonly inputs', () => {
    const changesets: readonly NewChangesetWithCommit[] = [];
    const selected: readonly string[] = [];

    expect(filterChangesets(changesets, selected)).toStrictEqual([]);
  });

  it('keeps releases for selected packages', () => {
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: '## Added\n\n- New feature',
      releases: [
        { name: '@scope/one', type: 'minor' },
        { name: '@scope/two', type: 'patch' },
      ],
    };

    expect(filterChangesets([changeset], ['@scope/two'])).toStrictEqual([
      {
        ...changeset,
        releases: [{ name: '@scope/two', type: 'patch' }],
      },
    ]);
  });

  it('drops changesets without selected releases', () => {
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: 'Summary',
      releases: [{ name: '@scope/one', type: 'minor' }],
    };

    expect(filterChangesets([changeset], ['@scope/two'])).toStrictEqual([]);
  });

  it('preserves metadata and clones returned objects', () => {
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: 'Summary',
      commit: 'abc123',
      releases: [{ name: '@scope/one', type: 'minor' }],
    };

    const input = [changeset];
    const result = filterChangesets(input, ['@scope/one']);

    expect(result).toStrictEqual([changeset]);
    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(changeset);
    expect(result[0].releases[0]).not.toBe(changeset.releases[0]);
  });
});
