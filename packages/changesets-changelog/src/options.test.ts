import { describe, expect, it } from 'vitest';

import { getGitHubRepository, validateChangelogOptions } from './options.js';

describe('validateChangelogOptions', () => {
  it('does not throw for options with a validated repository', () => {
    expect(() =>
      validateChangelogOptions({ repository: 'MetaMask/core' }),
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
});

describe('getGitHubRepository', () => {
  it('returns the validated repository', () => {
    expect(getGitHubRepository({ repository: 'MetaMask/core' })).toBe(
      'MetaMask/core',
    );
  });
});
