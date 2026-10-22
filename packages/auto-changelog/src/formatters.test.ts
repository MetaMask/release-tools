import { describe, expect, it, vi } from 'vitest';

import { oxfmt, prettier } from './formatters.js';

describe('oxfmt', () => {
  it('formats changelog with Oxfmt when installed', async () => {
    const input = '# Changelog\n\n* Initial release';

    expect(await oxfmt(input)).toBe('# Changelog\n\n- Initial release\n');
  });

  it('throws an error with a clear message when Oxfmt is not installed', async () => {
    vi.doMock('oxfmt', () => {
      throw new Error('Cannot find package');
    });

    await expect(oxfmt('# Changelog')).rejects.toThrow(
      'Failed to format changelog with Oxfmt. Is Oxfmt installed?',
    );

    vi.doUnmock('oxfmt');
  });
});

describe('prettier', () => {
  it('formats changelog with Prettier when installed', async () => {
    const input = '# Changelog\n\n- Initial release';

    expect(await prettier(input)).toBe('# Changelog\n\n- Initial release\n');
  });

  it('throws an error with a clear message when Prettier is not installed', async () => {
    vi.doMock('prettier/standalone', () => {
      throw new Error('Cannot find package');
    });

    await expect(prettier('# Changelog')).rejects.toThrow(
      'Failed to format changelog with Prettier. Is Prettier installed?',
    );

    vi.doUnmock('prettier/standalone');
  });
});
