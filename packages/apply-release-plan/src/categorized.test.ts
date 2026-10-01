import type { Config, ReleasePlan } from '@changesets/types';
import { getPackages } from '@manypkg/get-packages';
// Tests for the categorized (Keep a Changelog style) changelog mode — the
// extension this fork adds on top of upstream `@changesets/apply-release-plan`.
// These are deliberately kept in a separate file from the ported upstream
// tests (`index.test.ts`) to ease future rebases onto upstream.
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyReleasePlan } from './index.js';
import { temporarilySilenceLogs, testdir } from './test-utils/index.js';
import type { Fixture } from './test-utils/index.js';

const categorizedFunctionsPath = path.resolve(
  import.meta.dirname,
  'test-utils/categorized-functions.ts',
);
const invalidCategorizedFunctionsPath = path.resolve(
  import.meta.dirname,
  'test-utils/categorized-functions-invalid.ts',
);

const baseConfig: Config = {
  changelog: [categorizedFunctionsPath, null],
  commit: false,
  fixed: [],
  linked: [],
  access: 'restricted',
  changedFilePatterns: ['**'],
  baseBranch: 'main',
  updateInternalDependencies: 'patch',
  ignore: [],
  format: false,
  privatePackages: { version: true, tag: false },
  snapshot: {
    useCalculatedVersion: false,
    prereleaseTemplate: null,
  },
  ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
    onlyUpdatePeerDependentsWhenOutOfRange: false,
    updateInternalDependents: 'out-of-range',
  },
};

const kacChangelog = `# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0]

### Added

- Initial release ([#1](https://github.com/example/example/pull/1))

[1.0.0]: https://github.com/example/example/releases/tag/1.0.0
`;

async function applyToFixture(
  fixture: Fixture,
  releasePlan: ReleasePlan,
  config: Config = baseConfig,
): Promise<string> {
  const tempDir = await testdir(fixture);
  const packages = await getPackages(tempDir);
  await applyReleasePlan(releasePlan, packages, config);
  return tempDir;
}

function singlePackagePlan(summary: string): ReleasePlan {
  return {
    changesets: [
      {
        id: 'quick-lions-devour',
        summary,
        releases: [{ name: 'pkg-a', type: 'minor' }],
      },
    ],
    releases: [
      {
        name: 'pkg-a',
        type: 'minor',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
        changesets: ['quick-lions-devour'],
      },
    ],
    preState: undefined,
  };
}

describe('categorized changelog mode', () => {
  it('writes a bracketed version header with sections grouped by category', async () => {
    const tempDir = await applyToFixture(
      {
        'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'CHANGELOG.md': kacChangelog,
      },
      singlePackagePlan('Added: A new feature\nFixed: A pesky bug'),
    );

    const changelog = await fs.readFile(
      path.join(tempDir, 'CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toBe(`# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0]

### Added

- A new feature

### Fixed

- A pesky bug

## [1.0.0]

### Added

- Initial release ([#1](https://github.com/example/example/pull/1))

[1.0.0]: https://github.com/example/example/releases/tag/1.0.0
`);
  });

  it("orders sections by the module's categories declaration, not by entry order", async () => {
    const tempDir = await applyToFixture(
      {
        'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'CHANGELOG.md': kacChangelog,
      },
      singlePackagePlan('Fixed: A pesky bug\nAdded: A new feature'),
    );

    const changelog = await fs.readFile(
      path.join(tempDir, 'CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toContain(
      '## [1.1.0]\n\n### Added\n\n- A new feature\n\n### Fixed\n\n- A pesky bug',
    );
  });

  it('appends after the preamble when the changelog has no releases yet', async () => {
    const tempDir = await applyToFixture(
      {
        'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'CHANGELOG.md': `# Changelog

All notable changes to this project will be documented in this file.
`,
      },
      singlePackagePlan('Added: A new feature'),
    );

    const changelog = await fs.readFile(
      path.join(tempDir, 'CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toBe(`# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0]

### Added

- A new feature
`);
  });

  it('writes dependency updates under the category chosen by the changelog module', async () => {
    const releasePlan: ReleasePlan = {
      changesets: [
        {
          id: 'quick-lions-devour',
          summary: 'Added: A new feature',
          releases: [{ name: 'pkg-b', type: 'minor' }],
        },
      ],
      releases: [
        {
          name: 'pkg-b',
          type: 'minor',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          changesets: ['quick-lions-devour'],
        },
        {
          name: 'pkg-a',
          type: 'patch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          changesets: [],
        },
      ],
      preState: undefined,
    };

    const tempDir = await applyToFixture(
      {
        'package.json': JSON.stringify({
          private: true,
          workspaces: ['packages/*'],
        }),
        'package-lock.json': '',
        'packages/pkg-a/package.json': JSON.stringify({
          name: 'pkg-a',
          version: '1.0.0',
          dependencies: { 'pkg-b': '^1.0.0' },
        }),
        'packages/pkg-a/CHANGELOG.md': kacChangelog,
        'packages/pkg-b/package.json': JSON.stringify({
          name: 'pkg-b',
          version: '1.0.0',
        }),
        'packages/pkg-b/CHANGELOG.md': kacChangelog,
      },
      releasePlan,
    );

    const pkgAChangelog = await fs.readFile(
      path.join(tempDir, 'packages/pkg-a/CHANGELOG.md'),
      'utf8',
    );
    expect(pkgAChangelog).toContain(
      '## [1.0.1]\n\n### Changed\n\n- Bump `pkg-b` to `1.1.0`',
    );

    const pkgBChangelog = await fs.readFile(
      path.join(tempDir, 'packages/pkg-b/CHANGELOG.md'),
      'utf8',
    );
    expect(pkgBChangelog).toContain(
      '## [1.1.0]\n\n### Added\n\n- A new feature',
    );
  });

  it('notes when a release has no changelog entries', async () => {
    const tempDir = await applyToFixture(
      {
        'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'CHANGELOG.md': kacChangelog,
      },
      singlePackagePlan(''),
    );

    const changelog = await fs.readFile(
      path.join(tempDir, 'CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toContain('## [1.1.0]\n\nNo changes in this release.');
  });

  it(
    'errors on a category the module does not declare, leaving files untouched',
    temporarilySilenceLogs(async () => {
      const fixture = {
        'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'CHANGELOG.md': kacChangelog,
      };
      const tempDir = await testdir(fixture);
      const packages = await getPackages(tempDir);

      await expect(
        applyReleasePlan(
          singlePackagePlan('Bogus: An uncategorizable change'),
          packages,
          baseConfig,
        ),
      ).rejects.toThrow(
        'Unknown changelog category "Bogus" returned by getCategorizedReleaseLines (known categories: Added, Changed, Fixed)',
      );

      const changelog = await fs.readFile(
        path.join(tempDir, 'CHANGELOG.md'),
        'utf8',
      );
      expect(changelog).toStrictEqual(kacChangelog);
      const packageJson = await fs.readFile(
        path.join(tempDir, 'package.json'),
        'utf8',
      );
      expect(JSON.parse(packageJson).version).toBe('1.0.0');
    }),
  );

  it('errors when a categorized module lacks the rest of the categorized interface', async () => {
    const fixture = {
      'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
      'CHANGELOG.md': kacChangelog,
    };
    const tempDir = await testdir(fixture);
    const packages = await getPackages(tempDir);

    await expect(
      applyReleasePlan(singlePackagePlan('Added: A new feature'), packages, {
        ...baseConfig,
        changelog: [invalidCategorizedFunctionsPath, null],
      }),
    ).rejects.toThrow(
      'Changelog modules exporting `getCategorizedReleaseLines` must also export `getCategorizedDependencyReleaseLines` and a non-empty `categories` array',
    );
  });
});
