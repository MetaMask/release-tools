import path from 'path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

import {
  getFixturePackageDirectory,
  withChangesetsFixture,
} from '../tests/unit/changesets-fixture.js';
import type { ChangesetsFixtureOptions } from '../tests/unit/changesets-fixture.js';
import { buildMockPackage, buildMockProject } from '../tests/unit/helpers.js';
import { loadChangesetsPlan } from './changesets-plan.js';
import {
  findChangesetsCandidates,
  generateChangesetsReleaseSpecificationTemplate,
} from './changesets-release-specification.js';
import type { ChangesetsCandidate } from './changesets-release-specification.js';

const REPOSITORY_URL = 'https://github.com/example/repo';

const LEGACY_CHANGELOG = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add a legacy feature ([#1](https://github.com/example/repo/pull/1))

## [1.0.0]

### Added

- Initial release ([#0](https://github.com/example/repo/pull/0))

[Unreleased]: https://github.com/example/repo/compare/@scope/l@1.0.0...HEAD
[1.0.0]: https://github.com/example/repo/releases/tag/@scope/l@1.0.0
`;

const EMPTY_UNRELEASED_CHANGELOG = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0]

### Added

- Initial release ([#0](https://github.com/example/repo/pull/0))

[1.0.0]: https://github.com/example/repo/releases/tag/@scope/m@1.0.0
`;

/**
 * Builds the changelog of a package that has legacy `Unreleased` entries.
 *
 * @param name - The name of the package.
 * @returns The changelog content.
 */
function buildLegacyChangelog(name: string): string {
  return LEGACY_CHANGELOG.replaceAll('@scope/l@', `${name}@`);
}

const PACKAGES: NonNullable<ChangesetsFixtureOptions['packages']> = [
  { name: '@scope/a', version: '1.0.0' },
  { name: '@scope/b', version: '1.0.0' },
  {
    name: '@scope/c',
    version: '1.0.0',
    dependencies: { '@scope/b': '^1.0.0', '@scope/z': '^1.0.0' },
  },
  {
    name: '@scope/e',
    version: '2.0.0',
    peerDependencies: { '@scope/b': '^1.0.0' },
  },
  { name: '@scope/f', version: '1.0.0' },
  {
    name: '@scope/g',
    version: '1.0.0',
    devDependencies: { '@scope/a': '^1.0.0' },
  },
  {
    name: '@scope/l',
    version: '1.0.0',
    changelog: buildLegacyChangelog('@scope/l'),
  },
  {
    name: '@scope/m',
    version: '1.0.0',
    changelog: EMPTY_UNRELEASED_CHANGELOG,
  },
  { name: '@scope/n', version: '1.0.0' },
  { name: '@scope/z', version: '1.0.0' },
];

const CHANGESETS: NonNullable<ChangesetsFixtureOptions['changesets']> = [
  {
    id: 'brave-cats-sing',
    releases: { '@scope/a': 'minor' },
    summary: 'Add a feature to a',
  },
  {
    id: 'eager-owls-fly',
    releases: { '@scope/a': 'patch', '@scope/z': 'patch' },
    summary: 'Fix a and z',
  },
  {
    id: 'calm-dogs-run',
    releases: { '@scope/b': 'major' },
    summary: 'Break b',
  },
  {
    id: 'quiet-fish-nap',
    releases: { '@scope/f': 'none' },
    summary: 'Touch f without releasing it',
  },
];

/**
 * Builds a project whose workspace packages point at the fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param packages - The fixture packages.
 * @returns The project.
 */
function buildFixtureProject(
  rootDirectoryPath: string,
  packages: NonNullable<ChangesetsFixtureOptions['packages']>,
): ReturnType<typeof buildMockProject> {
  return buildMockProject({
    directoryPath: rootDirectoryPath,
    repositoryUrl: REPOSITORY_URL,
    isMonorepo: true,
    workspacePackages: Object.fromEntries(
      packages.map((fixturePackage) => [
        fixturePackage.name,
        buildMockPackage(fixturePackage.name, fixturePackage.version, {
          directoryPath: path.join(
            rootDirectoryPath,
            getFixturePackageDirectory(fixturePackage),
          ),
        }),
      ]),
    ),
  });
}

/**
 * Loads the candidates of a fixture.
 *
 * @param options - The description of the fixture.
 * @returns The candidates.
 */
async function findFixtureCandidates(
  options: ChangesetsFixtureOptions,
): Promise<ChangesetsCandidate[]> {
  return await withChangesetsFixture(options, async (rootDirectoryPath) => {
    const plan = await loadChangesetsPlan(rootDirectoryPath);
    return await findChangesetsCandidates({
      project: buildFixtureProject(rootDirectoryPath, options.packages ?? []),
      plan,
    });
  });
}

const CANDIDATES: ChangesetsCandidate[] = [
  {
    name: '@scope/a',
    kind: 'direct',
    currentVersion: '1.0.0',
    plannedType: 'minor',
    plannedVersion: '1.1.0',
    changesetCount: 2,
  },
  {
    name: '@scope/b',
    kind: 'direct',
    currentVersion: '1.0.0',
    plannedType: 'major',
    plannedVersion: '2.0.0',
    changesetCount: 1,
  },
  {
    name: '@scope/c',
    kind: 'propagated',
    currentVersion: '1.0.0',
    plannedType: 'patch',
    plannedVersion: '1.0.1',
    changesetCount: 0,
    reason: 'released because dependency @scope/b is released as major',
  },
  {
    name: '@scope/e',
    kind: 'propagated',
    currentVersion: '2.0.0',
    plannedType: 'patch',
    plannedVersion: '2.0.1',
    changesetCount: 0,
    reason: 'released because peer dependency @scope/b is released as major',
  },
  {
    name: '@scope/l',
    kind: 'legacy',
    currentVersion: '1.0.0',
    changesetCount: 0,
  },
];

describe('changesets-release-specification', () => {
  describe('findChangesetsCandidates', () => {
    it('lists direct, then propagated, then legacy packages, sorted by name within each kind', async () => {
      const candidates = await findFixtureCandidates({
        packages: [...PACKAGES].reverse(),
        changesets: CHANGESETS.filter(({ id }) => id !== 'eager-owls-fly'),
      });

      expect(candidates).toStrictEqual([
        { ...CANDIDATES[0], changesetCount: 1 },
        ...CANDIDATES.slice(1),
      ]);
    });

    it('counts the Changesets that release a direct package', async () => {
      const candidates = await findFixtureCandidates({
        packages: PACKAGES.filter(({ name }) => name !== '@scope/c'),
        changesets: CHANGESETS,
      });

      expect(candidates.filter(({ kind }) => kind === 'direct')).toStrictEqual([
        CANDIDATES[0],
        CANDIDATES[1],
        {
          name: '@scope/z',
          kind: 'direct',
          currentVersion: '1.0.0',
          plannedType: 'patch',
          plannedVersion: '1.0.1',
          changesetCount: 1,
        },
      ]);
    });

    it('does not list "none" releases', async () => {
      const candidates = await findFixtureCandidates({
        packages: PACKAGES,
        changesets: CHANGESETS,
      });

      const names = candidates.map(({ name }) => name);
      expect(names).not.toContain('@scope/f');
      expect(names).not.toContain('@scope/g');
    });

    it('lists a package that only has a "none" release and legacy entries as legacy', async () => {
      const candidates = await findFixtureCandidates({
        packages: [
          ...PACKAGES.filter(({ name }) => name !== '@scope/g'),
          {
            name: '@scope/g',
            version: '1.0.0',
            devDependencies: { '@scope/a': '^1.0.0' },
            changelog: buildLegacyChangelog('@scope/g'),
          },
        ],
        changesets: CHANGESETS,
      });

      expect(candidates.filter(({ kind }) => kind === 'legacy')).toStrictEqual([
        {
          name: '@scope/g',
          kind: 'legacy',
          currentVersion: '1.0.0',
          changesetCount: 0,
        },
        CANDIDATES[4],
      ]);
    });

    it('picks the first released dependency by name for the reason', async () => {
      const candidates = await findFixtureCandidates({
        packages: [
          { name: '@scope/a', version: '1.0.0' },
          { name: '@scope/b', version: '1.0.0' },
          {
            name: '@scope/c',
            version: '1.0.0',
            dependencies: {
              '@scope/y': '^1.0.0',
              '@scope/b': '^1.0.0',
              '@scope/a': '^1.0.0',
            },
            peerDependencies: { '@scope/x': '^1.0.0' },
          },
          { name: '@scope/x', version: '1.0.0' },
          { name: '@scope/y', version: '1.0.0' },
        ],
        changesets: [
          {
            id: 'calm-dogs-run',
            releases: { '@scope/b': 'major', '@scope/y': 'major' },
            summary: 'Break b and y',
          },
        ],
      });

      expect(candidates.find(({ name }) => name === '@scope/c')).toStrictEqual({
        name: '@scope/c',
        kind: 'propagated',
        currentVersion: '1.0.0',
        plannedType: 'patch',
        plannedVersion: '1.0.1',
        changesetCount: 0,
        reason: 'released because dependency @scope/b is released as major',
      });
    });

    it('omits the reason of a propagated release that no released dependency explains', async () => {
      const candidates = await findFixtureCandidates({
        packages: [
          { name: '@scope/a', version: '1.0.0' },
          { name: '@scope/b', version: '1.0.0' },
        ],
        changesets: [
          {
            id: 'brave-cats-sing',
            releases: { '@scope/a': 'minor' },
            summary: 'Add a feature to a',
          },
        ],
        config: { fixed: [['@scope/a', '@scope/b']] },
      });

      expect(candidates).toStrictEqual([
        {
          name: '@scope/a',
          kind: 'direct',
          currentVersion: '1.0.0',
          plannedType: 'minor',
          plannedVersion: '1.1.0',
          changesetCount: 1,
        },
        {
          name: '@scope/b',
          kind: 'propagated',
          currentVersion: '1.0.0',
          plannedType: 'minor',
          plannedVersion: '1.1.0',
          changesetCount: 0,
        },
      ]);
    });

    it('returns no candidates when nothing is pending', async () => {
      const candidates = await findFixtureCandidates({
        packages: PACKAGES.filter(({ name }) => name !== '@scope/l'),
      });

      expect(candidates).toStrictEqual([]);
    });

    it('propagates changelog parse errors', async () => {
      await expect(
        findFixtureCandidates({
          packages: [
            {
              name: '@scope/l',
              version: '1.0.0',
              changelog: `# Changelog\n\n## [Unreleased]\n\n[Unreleased]: ${REPOSITORY_URL}\n\n## [1.0.0]\n`,
            },
          ],
        }),
      ).rejects.toThrow(
        "Release header found outside the changelog content: '## [1.0.0]'",
      );
    });
  });

  describe('generateChangesetsReleaseSpecificationTemplate', () => {
    it('prefills each candidate and parses to the packages map', () => {
      const template = generateChangesetsReleaseSpecificationTemplate({
        candidates: CANDIDATES,
        isEditorAvailable: true,
      });

      expect(YAML.parse(template)).toStrictEqual({
        packages: {
          '@scope/a': 'minor',
          '@scope/b': 'major',
          '@scope/c': 'patch',
          '@scope/e': 'patch',
          '@scope/l': null,
        },
      });
    });

    it('writes a comment after each package line', () => {
      const template = generateChangesetsReleaseSpecificationTemplate({
        candidates: [
          ...CANDIDATES,
          {
            name: '@scope/x',
            kind: 'propagated',
            currentVersion: '1.0.0',
            plannedType: 'minor',
            plannedVersion: '1.1.0',
            changesetCount: 0,
          },
        ],
        isEditorAvailable: true,
      });

      expect(template.slice(template.indexOf('\npackages:') + 1)).toBe(
        `packages:
  "@scope/a": minor # 1.0.0 -> 1.1.0, 2 changesets
  "@scope/b": major # 1.0.0 -> 2.0.0, 1 changeset
  "@scope/c": patch # 1.0.0 -> 1.0.1, released because dependency @scope/b is released as major
  "@scope/e": patch # 2.0.0 -> 2.0.1, released because peer dependency @scope/b is released as major
  "@scope/l": null # legacy Unreleased entries only: choose major, minor, patch, or an exact version
  "@scope/x": minor # 1.0.0 -> 1.1.0
`,
      );
    });

    it('starts with instructions that end with saving the file when an editor is available', () => {
      const template = generateChangesetsReleaseSpecificationTemplate({
        candidates: CANDIDATES,
        isEditorAvailable: true,
      });

      const instructions = template.slice(0, template.indexOf('\npackages:'));
      expect(instructions).toMatch(
        /^# This file \(called the "release spec"\)/u,
      );
      expect(instructions).toContain('intentionally-skip');
      expect(instructions).toMatch(
        /# When you're finished, save this file and close it\. The tool will update the\n# versions of the packages you've listed and will apply the Changesets to their\n# changelogs\.\n$/u,
      );
    });

    it('ends the instructions with running the tool again when no editor is available', () => {
      const withEditor = generateChangesetsReleaseSpecificationTemplate({
        candidates: CANDIDATES,
        isEditorAvailable: true,
      });
      const withoutEditor = generateChangesetsReleaseSpecificationTemplate({
        candidates: CANDIDATES,
        isEditorAvailable: false,
      });

      const lastParagraph = (template: string): string => {
        const instructions = template.slice(0, template.indexOf('\npackages:'));
        return instructions.slice(instructions.lastIndexOf('#\n') + 2);
      };
      expect(lastParagraph(withoutEditor)).toBe(
        `# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed and will apply
# the Changesets to their changelogs.
`,
      );
      expect(withoutEditor.replace(lastParagraph(withoutEditor), '')).toBe(
        withEditor.replace(lastParagraph(withEditor), ''),
      );
    });

    it('throws when there are no candidates', () => {
      expect(() =>
        generateChangesetsReleaseSpecificationTemplate({
          candidates: [],
          isEditorAvailable: true,
        }),
      ).toThrow(
        'Could not generate release specification: There are no packages to release.',
      );
    });
  });
});
