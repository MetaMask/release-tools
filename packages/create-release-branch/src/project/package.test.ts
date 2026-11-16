import * as autoChangelog from '@metamask/auto-changelog';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'prettier';
import { describe, expect, it, vi } from 'vitest';

import {
  buildChangelog,
  normalizeMultilineString,
  withSandbox,
} from '../../tests/helpers.js';
import {
  buildMockPackage,
  buildMockProject,
  buildMockManifest,
} from '../../tests/unit/helpers.js';
import * as fsModule from '../utils/fs.js';
import * as packageManifestModule from './package-manifest.js';
import {
  getFormatter,
  readPackage,
  updatePackage,
  updatePackageChangelog,
} from './package.js';

vi.mock('./package-manifest');
vi.mock('@metamask/auto-changelog', async () => ({
  ...(await vi.importActual('@metamask/auto-changelog')),
  updateChangelog: vi.fn(),

  // Replacing the implementation of the `oxfmt` function because Jest
  // doesn't work well with dynamic imports, and Oxfmt is ESM-only.
  oxfmt: async (content: string): Promise<string> => content,

  // Replacing the implementation of the `prettier` function because Jest
  // doesn't work well with dynamic imports.
  prettier: async (content: string): Promise<string> => {
    const { default: markdown } = await vi.importActual<{
      default: Plugin;
    }>('prettier/plugins/markdown');
    const { format } = await vi.importActual<
      typeof import('prettier/standalone')
    >('prettier/standalone');
    return await format(content, { parser: 'markdown', plugins: [markdown] });
  },
}));

describe('package', () => {
  describe('readPackage', () => {
    it('returns information about the file structure of the package located at the given directory', async () => {
      vi.spyOn(packageManifestModule, 'readPackageManifest').mockResolvedValue({
        unvalidated: {},
        validated: buildMockManifest(),
      });

      const pkg = await readPackage('/path/to/package');

      expect(pkg).toMatchObject({
        directoryPath: '/path/to/package',
        manifestPath: '/path/to/package/package.json',
        changelogPath: '/path/to/package/CHANGELOG.md',
      });
    });

    it('returns information about the manifest (in both unvalidated and validated forms)', async () => {
      const unvalidatedManifest = {};
      const validatedManifest = buildMockManifest();
      vi.when(vi.spyOn(packageManifestModule, 'readPackageManifest'))
        .calledWith('/path/to/package/package.json')
        .thenResolve({
          unvalidated: unvalidatedManifest,
          validated: validatedManifest,
        });

      const pkg = await readPackage('/path/to/package');

      expect(pkg).toMatchObject({
        unvalidatedManifest,
        validatedManifest,
      });
    });
  });

  describe('updatePackage', () => {
    it('writes the planned version to the planned package', async () => {
      await withSandbox(async (sandbox) => {
        const project = {
          directoryPath: '/path/to/project',
          repositoryUrl: 'https://repo.url',
        };
        const manifestPath = path.join(sandbox.directoryPath, 'package.json');
        const packageReleasePlan = {
          package: buildMockPackage({
            directoryPath: sandbox.directoryPath,
            manifestPath,
            validatedManifest: buildMockManifest(),
            changelogPath: path.join(sandbox.directoryPath, 'CHANGELOG.md'),
          }),
          newVersion: '2.0.0',
        };

        await updatePackage({
          project,
          packageReleasePlan,
          formatter: 'prettier',
        });

        const newManifest = JSON.parse(
          await fs.promises.readFile(manifestPath, 'utf8'),
        ) as Record<string, unknown>;
        expect(newManifest).toMatchObject({
          version: '2.0.0',
        });
      });
    });

    it('migrates all unreleased changes to a release section', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const packageReleasePlan = {
          package: buildMockPackage({
            directoryPath: sandbox.directoryPath,
            manifestPath: path.join(sandbox.directoryPath, 'package.json'),
            validatedManifest: buildMockManifest(),
            changelogPath,
          }),
          newVersion: '2.0.0',
        };

        await fs.promises.writeFile(
          changelogPath,
          buildChangelog(`
            ## [Unreleased]
            ### Uncategorized
            - Add isNewFunction ([#2](https://repo.url/compare/package/pull/2))

            ## [1.0.0] - 2020-01-01
            ### Changed
            - Something else

            [Unreleased]: https://repo.url/compare/package@2.0.0...HEAD
            [1.0.0]: https://repo.url/releases/tag/package@1.0.0
          `),
        );

        await updatePackage({
          project,
          packageReleasePlan,
          formatter: 'prettier',
        });

        const newChangelogContent = await fs.promises.readFile(
          changelogPath,
          'utf8',
        );

        expect(newChangelogContent).toBe(
          buildChangelog(`
            ## [Unreleased]

            ## [2.0.0]

            ### Uncategorized

            - Add isNewFunction ([#2](https://repo.url/compare/package/pull/2))

            ## [1.0.0] - 2020-01-01

            ### Changed

            - Something else

            [Unreleased]: https://repo.url/compare/package@2.0.0...HEAD
            [2.0.0]: https://repo.url/compare/package@1.0.0...package@2.0.0
            [1.0.0]: https://repo.url/releases/tag/package@1.0.0
          `),
        );
      });
    });

    it('migrates all unreleased changes to a release section with Oxfmt', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const packageReleasePlan = {
          package: buildMockPackage({
            directoryPath: sandbox.directoryPath,
            manifestPath: path.join(sandbox.directoryPath, 'package.json'),
            validatedManifest: buildMockManifest(),
            changelogPath,
          }),
          newVersion: '2.0.0',
        };

        await fs.promises.writeFile(
          changelogPath,
          buildChangelog(`
            ## [Unreleased]
            ### Uncategorized
            - Add isNewFunction ([#2](https://repo.url/compare/package/pull/2))

            ## [1.0.0] - 2020-01-01
            ### Changed
            - Something else

            [Unreleased]: https://repo.url/compare/package@2.0.0...HEAD
            [1.0.0]: https://repo.url/releases/tag/package@1.0.0
          `),
        );

        await updatePackage({
          project,
          packageReleasePlan,
          formatter: 'oxfmt',
        });

        const newChangelogContent = await fs.promises.readFile(
          changelogPath,
          'utf8',
        );

        expect(newChangelogContent).toBe(
          normalizeMultilineString(`
            # Changelog
            All notable changes to this project will be documented in this file.

            The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
            and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

            ## [Unreleased]

            ## [2.0.0]
            ### Uncategorized
            - Add isNewFunction ([#2](https://repo.url/compare/package/pull/2))

            ## [1.0.0] - 2020-01-01
            ### Changed
            - Something else

            [Unreleased]: https://repo.url/compare/package@2.0.0...HEAD
            [2.0.0]: https://repo.url/compare/package@1.0.0...package@2.0.0
            [1.0.0]: https://repo.url/releases/tag/package@1.0.0
          `),
        );
      });
    });

    it("throws if reading the package's changelog fails in an unexpected way", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const packageReleasePlan = {
          package: buildMockPackage({
            directoryPath: sandbox.directoryPath,
            manifestPath: path.join(sandbox.directoryPath, 'package.json'),
            validatedManifest: buildMockManifest(),
            changelogPath,
          }),
          newVersion: '2.0.0',
        };
        vi.spyOn(fsModule, 'readFile').mockRejectedValue(new Error('oops'));

        await expect(
          updatePackage({
            project,
            packageReleasePlan,
            formatter: 'prettier',
          }),
        ).rejects.toThrow('oops');
      });
    });

    it('returns no-changelog when the package does not have a changelog', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const packageReleasePlan = {
          package: buildMockPackage({
            directoryPath: sandbox.directoryPath,
            manifestPath: path.join(sandbox.directoryPath, 'package.json'),
            validatedManifest: buildMockManifest(),
            changelogPath,
          }),
          newVersion: '2.0.0',
        };

        const result = await updatePackage({
          project,
          packageReleasePlan,
          formatter: 'prettier',
        });

        expect(result).toBe('no-changelog');
      });
    });
  });

  describe('updatePackageChangelog', () => {
    it('updates the changelog of the package if requested to do so and if the package has one', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const pkg = buildMockPackage({
          directoryPath: sandbox.directoryPath,
          manifestPath: path.join(sandbox.directoryPath, 'package.json'),
          validatedManifest: buildMockManifest(),
          changelogPath,
        });
        vi.when(vi.spyOn(autoChangelog, 'updateChangelog'))
          .calledWith({
            changelogContent: 'existing changelog',
            isReleaseCandidate: false,
            projectRootDirectory: sandbox.directoryPath,
            repoUrl: 'https://repo.url',
            tagPrefixes: ['package@', 'v'],
            formatter: expect.any(Function) as (
              content: string,
            ) => Promise<string>,
          })
          .thenResolve('new changelog');
        await fs.promises.writeFile(changelogPath, 'existing changelog');

        const result = await updatePackageChangelog({
          project,
          package: pkg,
          formatter: 'prettier',
        });

        const newChangelogContent = await fs.promises.readFile(
          changelogPath,
          'utf8',
        );
        expect(newChangelogContent).toBe('new changelog');
        expect(result).toBe('updated');
      });
    });

    it('returns no-updates when there is nothing to add', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const pkg = buildMockPackage({
          directoryPath: sandbox.directoryPath,
          manifestPath: path.join(sandbox.directoryPath, 'package.json'),
          validatedManifest: buildMockManifest(),
          changelogPath,
        });
        vi.when(vi.spyOn(autoChangelog, 'updateChangelog'))
          .calledWith({
            changelogContent: 'existing changelog',
            isReleaseCandidate: false,
            projectRootDirectory: sandbox.directoryPath,
            repoUrl: 'https://repo.url',
            tagPrefixes: ['package@', 'v'],
            formatter: expect.any(Function) as (
              content: string,
            ) => Promise<string>,
          })
          .thenResolve(undefined);
        await fs.promises.writeFile(changelogPath, 'existing changelog');

        const result = await updatePackageChangelog({
          project,
          package: pkg,
          formatter: 'prettier',
        });

        const newChangelogContent = await fs.promises.readFile(
          changelogPath,
          'utf8',
        );
        expect(newChangelogContent).toBe('existing changelog');
        expect(result).toBe('no-updates');
      });
    });

    it('returns no-changelog when the changelog is missing', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const pkg = buildMockPackage({
          directoryPath: sandbox.directoryPath,
          manifestPath: path.join(sandbox.directoryPath, 'package.json'),
          validatedManifest: buildMockManifest(),
          changelogPath,
        });

        const result = await updatePackageChangelog({
          project,
          package: pkg,
          formatter: 'prettier',
        });

        expect(result).toBe('no-changelog');
      });
    });

    it("throws if reading the package's changelog fails in an unexpected way", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          repositoryUrl: 'https://repo.url',
        });
        const changelogPath = path.join(sandbox.directoryPath, 'CHANGELOG.md');
        const pkg = buildMockPackage({
          directoryPath: sandbox.directoryPath,
          manifestPath: path.join(sandbox.directoryPath, 'package.json'),
          validatedManifest: buildMockManifest(),
          changelogPath,
        });
        vi.spyOn(fsModule, 'readFile').mockRejectedValue(new Error('oops'));

        await expect(
          updatePackageChangelog({
            project,
            package: pkg,
            formatter: 'prettier',
          }),
        ).rejects.toThrow('oops');
      });
    });
  });

  describe('getFormatter', () => {
    it('returns the Oxfmt formatter', async () => {
      const formatter = getFormatter('oxfmt');
      expect(formatter).toBe(autoChangelog.oxfmt);
    });

    it('returns the Prettier formatter', async () => {
      const formatter = getFormatter('prettier');
      expect(formatter).toBe(autoChangelog.prettier);
    });

    it('throws if an unknown formatter name is given', async () => {
      // @ts-expect-error: Invalid formatter name for testing purposes.
      expect(() => getFormatter('some-unknown-formatter')).toThrow(
        'Invalid branch reached. Should be detected during compilation.',
      );
    });
  });
});
