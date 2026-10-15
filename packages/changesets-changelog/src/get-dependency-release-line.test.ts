import type { ModCompWithPackage } from '@changesets/types';
import { describe, expect, it } from 'vitest';

import {
  categorizeDependencyReleaseLine,
  getDependencyReleaseLine,
} from './get-dependency-release-line.js';

/**
 * Builds an updated dependency.
 *
 * @param overrides - The fields to override.
 * @returns The dependency.
 */
function buildDependency(
  overrides: Partial<ModCompWithPackage> = {},
): ModCompWithPackage {
  return {
    name: '@metamask/base-controller',
    type: 'minor',
    oldVersion: '1.2.0',
    newVersion: '1.3.0',
    changesets: [],
    packageJson: { name: '@metamask/base-controller', version: '1.2.0' },
    dir: '/packages/base-controller',
    ...overrides,
  } as ModCompWithPackage;
}

describe('getDependencyReleaseLine', () => {
  it('returns an empty string when no dependency changed', async () => {
    expect(
      await getDependencyReleaseLine([], [], { repo: 'MetaMask/core' }),
    ).toBe('');
  });

  it('renders one caret-ranged line per dependency', async () => {
    expect(
      await getDependencyReleaseLine(
        [],
        [
          buildDependency(),
          buildDependency({
            name: '@metamask/utils',
            oldVersion: '^9.0.0',
            newVersion: '^10.0.0',
          }),
        ],
        { repo: 'MetaMask/core' },
      ),
    ).toBe(
      [
        '- Bump `@metamask/base-controller` from `^1.2.0` to `^1.3.0`',
        '- Bump `@metamask/utils` from `^9.0.0` to `^10.0.0`',
      ].join('\n'),
    );
  });

  it('throws when the options have no repo', async () => {
    await expect(
      getDependencyReleaseLine([], [buildDependency()], null),
    ).rejects.toThrow('Please provide a repo to this changelog generator');
  });

  it.each([
    { oldVersion: undefined, newVersion: '1.3.0' },
    { oldVersion: '1.2.0', newVersion: undefined },
  ])('throws when a version is missing', async (versions) => {
    await expect(
      getDependencyReleaseLine([], [buildDependency(versions)], {
        repo: 'MetaMask/core',
      }),
    ).rejects.toThrow(
      'Dependency @metamask/base-controller must have old and new versions',
    );
  });
});

describe('categorizeDependencyReleaseLine', () => {
  it('assigns every line to Changed', async () => {
    const first = '- Bump `pkg-a` from `^1.0.0` to `^1.1.0`';
    const second = '- Bump `pkg-b` from `^2.0.0` to `^2.1.0`';

    expect(
      await categorizeDependencyReleaseLine(`${first}\n${second}`),
    ).toStrictEqual([
      { category: 'Changed', line: first },
      { category: 'Changed', line: second },
    ]);
  });

  it('drops empty lines', async () => {
    expect(await categorizeDependencyReleaseLine('')).toStrictEqual([]);
  });
});
