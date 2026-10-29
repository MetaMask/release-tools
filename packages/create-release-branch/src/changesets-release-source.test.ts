import fs from 'fs';
import path from 'path';
import { MockWritable } from 'stdio-mock';
import { describe, expect, it, vi } from 'vitest';

import { buildChangelog } from '../tests/helpers.js';
import {
  buildLocalChangelogSummary,
  LOCAL_CHANGELOG_CONFIG,
  LOCAL_CHANGELOG_FILES,
  LOCAL_CHANGELOG_REPOSITORY_URL,
  readChangesetsFixtureProject,
  withChangesetsFixture,
  writeChangesetFile,
} from '../tests/unit/changesets-fixture.js';
import type {
  ChangesetsFixtureOptions,
  ChangesetsFixturePackage,
} from '../tests/unit/changesets-fixture.js';
import {
  buildMockProject,
  createNoopWriteStream,
} from '../tests/unit/helpers.js';
import { applyChangesetsRelease } from './changesets-apply.js';
import { createChangesetsReleaseSource } from './changesets-release-source.js';
import { fileExists } from './fs.js';
import { validateReleaseSpecification } from './release-specification.js';
import { followReleaseWorkflow } from './release-workflow.js';
import * as workflowOperations from './workflow-operations.js';

vi.mock('./changesets-apply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./changesets-apply.js')>();
  return {
    ...actual,
    applyChangesetsRelease: vi.fn(actual.applyChangesetsRelease),
  };
});
vi.mock('./release-specification', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./release-specification.js')>();
  return {
    ...actual,
    validateReleaseSpecification: vi.fn(actual.validateReleaseSpecification),
  };
});
vi.mock('./repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repo.js')>();
  return { ...actual, commitAllChanges: vi.fn() };
});
vi.mock('./workflow-operations');
vi.mock('./yarn-commands');

const REPOSITORY_URL = LOCAL_CHANGELOG_REPOSITORY_URL;

const PACKAGES: ChangesetsFixturePackage[] = [
  {
    name: '@example/a',
    version: '1.0.0',
    changelog: buildChangelog(`
      ## [1.0.0]

      ### Added

      - Initial release ([#0](${REPOSITORY_URL}/pull/0))

      [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/a@1.0.0
    `),
  },
  { name: '@example/b', version: '1.0.0' },
  {
    name: '@example/c',
    version: '1.0.0',
    dependencies: { '@example/b': '^1.0.0' },
  },
  { name: '@example/f', version: '1.0.0' },
  {
    name: '@example/l',
    version: '1.0.0',
    changelog: buildChangelog(`
      ## [Unreleased]

      ### Fixed

      - Fix a legacy bug in l ([#2](${REPOSITORY_URL}/pull/2))

      ## [1.0.0]

      ### Added

      - Initial release ([#0](${REPOSITORY_URL}/pull/0))

      [Unreleased]: ${REPOSITORY_URL}/compare/@example/l@1.0.0...HEAD
      [1.0.0]: ${REPOSITORY_URL}/releases/tag/@example/l@1.0.0
    `),
  },
];

const FIXTURE: ChangesetsFixtureOptions = {
  packages: PACKAGES,
  changesets: [
    {
      id: 'brave-cats-sing',
      releases: { '@example/a': 'minor' },
      summary: buildLocalChangelogSummary('Added', 'Add a feature to a', 10),
    },
    {
      id: 'calm-dogs-run',
      releases: { '@example/b': 'major' },
      summary: buildLocalChangelogSummary('Removed', 'Remove the API', 11),
    },
    {
      id: 'quiet-fish-nap',
      releases: { '@example/f': 'none' },
      summary: 'Touch f without releasing it',
    },
  ],
  config: LOCAL_CHANGELOG_CONFIG,
  files: LOCAL_CHANGELOG_FILES,
};

const F_CHANGESET = {
  id: 'happy-frogs-jump',
  releases: { '@example/f': 'minor' },
  summary: buildLocalChangelogSummary('Added', 'Add a feature to f', 12),
};

const VALID_SPEC = `packages:
  "@example/a": minor
  "@example/b": major
  "@example/c": patch
  "@example/l": patch
`;

const SPEC_RELEASING_F = `${VALID_SPEC}  "@example/f": minor\n`;

/**
 * Writes a release spec next to a fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param content - The content of the release spec.
 * @returns The path of the release spec.
 */
async function writeReleaseSpecification(
  rootDirectoryPath: string,
  content: string,
): Promise<string> {
  const releaseSpecificationPath = path.join(
    rootDirectoryPath,
    'tmp',
    'RELEASE_SPEC.yml',
  );
  await fs.promises.mkdir(path.dirname(releaseSpecificationPath), {
    recursive: true,
  });
  await fs.promises.writeFile(releaseSpecificationPath, content);
  return releaseSpecificationPath;
}

/**
 * Reads every manifest, changelog and Changeset file of a fixture.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @returns The content of each file, by path relative to the root.
 */
async function readReleaseFiles(
  rootDirectoryPath: string,
): Promise<Record<string, string>> {
  const relativePaths = ['package.json'];
  for (const directoryName of await fs.promises.readdir(
    path.join(rootDirectoryPath, 'packages'),
  )) {
    for (const fileName of ['package.json', 'CHANGELOG.md']) {
      relativePaths.push(path.join('packages', directoryName, fileName));
    }
  }
  for (const fileName of await fs.promises.readdir(
    path.join(rootDirectoryPath, '.changeset'),
  )) {
    if (fileName.endsWith('.md')) {
      relativePaths.push(path.join('.changeset', fileName));
    }
  }

  const files: Record<string, string> = {};
  for (const relativePath of relativePaths.sort()) {
    const filePath = path.join(rootDirectoryPath, relativePath);
    if (await fileExists(filePath)) {
      files[relativePath] = await fs.promises.readFile(filePath, 'utf8');
    }
  }
  return files;
}

/**
 * Reads the version in the manifest of a fixture package.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param directoryName - The directory of the package in `packages/`.
 * @returns The version.
 */
async function readVersion(
  rootDirectoryPath: string,
  directoryName: string,
): Promise<string> {
  const manifest = JSON.parse(
    await fs.promises.readFile(
      path.join(rootDirectoryPath, 'packages', directoryName, 'package.json'),
      'utf8',
    ),
  ) as { version: string };
  return manifest.version;
}

describe('changesets-release-source', () => {
  describe('createChangesetsReleaseSource', () => {
    it('allows an empty "Initialize Release" commit and prepares nothing', async () => {
      const source = createChangesetsReleaseSource({
        project: buildMockProject(),
        formatter: 'prettier',
        stderr: createNoopWriteStream(),
      });

      expect(source.allowEmptyInitializeCommit).toBe(true);
      expect(await source.prepare()).toBeUndefined();
    });

    it('generates the template from the Changesets found on each call', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const source = createChangesetsReleaseSource({
          project: await readChangesetsFixtureProject(rootDirectoryPath),
          formatter: 'prettier',
          stderr: createNoopWriteStream(),
        });

        const firstTemplate = await source.generateReleaseSpecificationTemplate(
          { isEditorAvailable: true },
        );
        await writeChangesetFile(rootDirectoryPath, F_CHANGESET);
        const secondTemplate =
          await source.generateReleaseSpecificationTemplate({
            isEditorAvailable: true,
          });

        expect(firstTemplate).toMatch(/^ {2}"@example\/a": minor # /mu);
        expect(firstTemplate).toMatch(/^ {2}"@example\/b": major # /mu);
        expect(firstTemplate).toMatch(/^ {2}"@example\/c": patch # /mu);
        expect(firstTemplate).toMatch(/^ {2}"@example\/l": null # /mu);
        expect(firstTemplate).not.toContain('@example/f');
        expect(secondTemplate).toMatch(/^ {2}"@example\/f": minor # /mu);
      });
    });

    it('validates the spec with the direct and legacy packages as the packages with changes', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const project = await readChangesetsFixtureProject(rootDirectoryPath);
        const source = createChangesetsReleaseSource({
          project,
          formatter: 'prettier',
          stderr: createNoopWriteStream(),
        });
        const releaseSpecificationPath = await writeReleaseSpecification(
          rootDirectoryPath,
          VALID_SPEC,
        );

        const { plan, releasePlan } = await source.validateReleaseSpecification(
          releaseSpecificationPath,
        );

        expect(validateReleaseSpecification).toHaveBeenCalledWith(
          project,
          releaseSpecificationPath,
          {
            packagesWithChanges: new Set([
              '@example/a',
              '@example/b',
              '@example/l',
            ]),
          },
        );
        expect(plan.originalChangesets.map(({ id }) => id)).toStrictEqual([
          'brave-cats-sing',
          'calm-dogs-run',
          'quiet-fish-nap',
        ]);
        expect(
          releasePlan.filteredPlan.releases
            .map(({ name, type, newVersion }) => ({ name, type, newVersion }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        ).toStrictEqual([
          { name: '@example/a', type: 'minor', newVersion: '1.1.0' },
          { name: '@example/b', type: 'major', newVersion: '2.0.0' },
          { name: '@example/c', type: 'patch', newVersion: '1.0.1' },
          { name: '@example/f', type: 'none', newVersion: '1.0.0' },
        ]);
        expect(releasePlan.legacyReleases).toStrictEqual([
          { name: '@example/l', newVersion: '1.0.1' },
        ]);
      });
    });

    it('validates the spec against the Changesets found on each call', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const source = createChangesetsReleaseSource({
          project: await readChangesetsFixtureProject(rootDirectoryPath),
          formatter: 'prettier',
          stderr: createNoopWriteStream(),
        });
        const releaseSpecificationPath = await writeReleaseSpecification(
          rootDirectoryPath,
          SPEC_RELEASING_F,
        );

        await expect(
          source.validateReleaseSpecification(releaseSpecificationPath),
        ).rejects.toThrow(
          '@example/f is listed in the release spec but has nothing to release',
        );
        await writeChangesetFile(rootDirectoryPath, F_CHANGESET);
        const { releasePlan } = await source.validateReleaseSpecification(
          releaseSpecificationPath,
        );

        expect(
          releasePlan.filteredPlan.releases.find(
            ({ name }) => name === '@example/f',
          ),
        ).toMatchObject({ type: 'minor', newVersion: '1.1.0' });
      });
    });

    it('applies the validated spec with applyChangesetsRelease', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const project = await readChangesetsFixtureProject(rootDirectoryPath);
        const stderr = createNoopWriteStream();
        const source = createChangesetsReleaseSource({
          project,
          formatter: 'prettier',
          stderr,
        });
        const releaseSpecification = await source.validateReleaseSpecification(
          await writeReleaseSpecification(rootDirectoryPath, VALID_SPEC),
        );

        await source.apply({
          releaseSpecification,
          newReleaseVersion: '2.0.0',
        });

        expect(applyChangesetsRelease).toHaveBeenCalledWith({
          project,
          plan: releaseSpecification.plan,
          releasePlan: releaseSpecification.releasePlan,
          newReleaseVersion: '2.0.0',
          formatter: 'prettier',
          stderr,
        });
        expect(await readVersion(rootDirectoryPath, 'a')).toBe('1.1.0');
        expect(await readVersion(rootDirectoryPath, 'l')).toBe('1.0.1');
      });
    });

    it('leaves every manifest, changelog and Changeset untouched and keeps the spec if the spec fails plan-level validation', async () => {
      await withChangesetsFixture(FIXTURE, async (rootDirectoryPath) => {
        const project = await readChangesetsFixtureProject(rootDirectoryPath);
        const releaseSpecificationPath = await writeReleaseSpecification(
          rootDirectoryPath,
          SPEC_RELEASING_F,
        );
        vi.spyOn(workflowOperations, 'createReleaseBranch').mockResolvedValue({
          version: '2.0.0',
          firstRun: false,
        });
        const filesBefore = await readReleaseFiles(rootDirectoryPath);

        await expect(
          followReleaseWorkflow({
            project,
            tempDirectoryPath: path.dirname(releaseSpecificationPath),
            firstRemovingExistingReleaseSpecification: false,
            releaseType: 'ordinary',
            source: createChangesetsReleaseSource({
              project,
              formatter: 'prettier',
              stderr: createNoopWriteStream(),
            }),
            stdout: new MockWritable(),
          }),
        ).rejects.toThrow(
          '@example/f is listed in the release spec but has nothing to release',
        );

        expect(await readReleaseFiles(rootDirectoryPath)).toStrictEqual(
          filesBefore,
        );
        expect(Object.keys(filesBefore)).toContain(
          '.changeset/brave-cats-sing.md',
        );
        expect(
          await fs.promises.readFile(releaseSpecificationPath, 'utf8'),
        ).toBe(SPEC_RELEASING_F);
        expect(applyChangesetsRelease).not.toHaveBeenCalled();
      });
    });
  });
});
