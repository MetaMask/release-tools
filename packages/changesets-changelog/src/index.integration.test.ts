import type {
  Config,
  NewChangesetWithCommit,
  ReleasePlan,
} from '@changesets/types';
import { getPackages } from '@manypkg/get-packages';
import { applyReleasePlan } from '@metamask/apply-release-plan';
import { parseChangelog } from '@metamask/auto-changelog';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('execa', async () => ({
  ...(await vi.importActual<typeof import('execa')>('execa')),
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);
const changelogModulePath = path.resolve(import.meta.dirname, 'index.ts');

async function createFixture(files: Record<string, string>): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'changesets-changelog-'),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  return directory;
}

const config: Config = {
  changelog: [changelogModulePath, { repo: 'MetaMask/core' }],
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

describe('changesets-changelog integration', () => {
  it('renders a categorized changelog block through applyReleasePlan', async () => {
    mockedExeca.mockResolvedValue({
      stdout: 'Add a feature (#1234)',
    } as never);

    const fixture = {
      'package.json': JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
      'CHANGELOG.md': `# Changelog

## [Unreleased]

## [1.0.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/v1.0.0
`,
    };
    const tempDir = await createFixture(fixture);
    const packages = await getPackages(tempDir);
    // `applyReleasePlan` keeps this commit, because the fixture directory has
    // no Git history to resolve the changeset file from.
    const changeset: NewChangesetWithCommit = {
      id: 'quick-lions-devour',
      summary: '## Added\n\n- Add a feature\n  - Configure it safely',
      releases: [{ name: 'pkg-a', type: 'minor' }],
      commit: 'abc1234',
    };
    const releasePlan: ReleasePlan = {
      changesets: [changeset],
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

    await applyReleasePlan(releasePlan, packages, config);

    const changelog = await fs.readFile(
      path.join(tempDir, 'CHANGELOG.md'),
      'utf8',
    );
    const expectedEntry =
      '- Add a feature ([#1234](https://github.com/MetaMask/core/pull/1234))\n  - Configure it safely';
    expect(changelog).toContain(`## [1.1.0]\n\n### Added\n\n${expectedEntry}`);
    // A round trip through `auto-changelog` must keep the entry intact,
    // including its sub-bullet.
    const roundTripped = await parseChangelog({
      changelogContent: changelog,
      repoUrl: 'https://github.com/MetaMask/core',
    }).toString();
    expect(roundTripped).toContain(expectedEntry);
  });
});
