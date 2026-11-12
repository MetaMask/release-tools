import { describe, expect, it } from 'vitest';

import { getChangelogOptions, validateChangelogOptions } from './options.js';

describe('validateChangelogOptions', () => {
  it('does not throw for options with a validated repository', () => {
    expect(() =>
      validateChangelogOptions({ repository: 'MetaMask/core' }),
    ).not.toThrow();
  });

  it('does not throw for options with a validated repository and cwd', () => {
    expect(() =>
      validateChangelogOptions({
        repository: 'MetaMask/core',
        cwd: '/path/to/repo',
      }),
    ).not.toThrow();
  });

  it.each([
    null,
    {},
    { repository: '' },
    { repository: '   ' },
    { repository: 123 },
  ])('throws when repository is missing or invalid: %j', (options) => {
    expect(() => validateChangelogOptions(options)).toThrow('"repository"');
  });

  it.each([
    { repository: 'MetaMask/core', cwd: '' },
    { repository: 'MetaMask/core', cwd: '   ' },
    { repository: 'MetaMask/core', cwd: 123 },
  ])('throws when cwd is invalid: %j', (options) => {
    expect(() => validateChangelogOptions(options)).toThrow('"cwd"');
  });
});

describe('getChangelogOptions', () => {
  it('returns the validated repository', () => {
    expect(getChangelogOptions({ repository: 'MetaMask/core' })).toStrictEqual({
      repository: 'MetaMask/core',
      cwd: undefined,
    });
  });

  it('returns cwd when provided', () => {
    expect(
      getChangelogOptions({
        repository: 'MetaMask/core',
        cwd: '/path/to/repo',
      }),
    ).toStrictEqual({
      repository: 'MetaMask/core',
      cwd: '/path/to/repo',
    });
  });
});
