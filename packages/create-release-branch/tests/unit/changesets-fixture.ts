import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

import { withSandbox } from '../helpers.js';

/**
 * A workspace package in a Changesets fixture.
 */
export type ChangesetsFixturePackage = {
  name: string;
  version: string;
  /**
   * The directory of the package, relative to the root. Defaults to
   * `packages/<name without scope>`.
   */
  directory?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  /**
   * The content of `CHANGELOG.md`. No changelog is written if omitted.
   */
  changelog?: string;
};

/**
 * A Changeset file in a Changesets fixture.
 */
export type ChangesetsFixtureChangeset = {
  id: string;
  releases: Record<string, string>;
  summary: string;
};

/**
 * Describes the monorepo that a Changesets fixture writes.
 */
export type ChangesetsFixtureOptions = {
  /**
   * Fields merged over the default root manifest.
   */
  rootManifest?: Record<string, unknown>;
  packages?: ChangesetsFixturePackage[];
  changesets?: ChangesetsFixtureChangeset[];
  /**
   * Fields merged over {@link DEFAULT_CHANGESETS_CONFIG} to form
   * `.changeset/config.json`.
   */
  config?: Record<string, unknown>;
  /**
   * The content of `.changeset/pre.json`. No file is written if omitted.
   */
  preState?: Record<string, unknown>;
  /**
   * Extra files to write, keyed by path relative to the root.
   */
  files?: Record<string, string>;
};

/**
 * The `.changeset/config.json` that fixtures use unless overridden.
 */
export const DEFAULT_CHANGESETS_CONFIG = {
  changelog: '@changesets/cli/changelog',
  commit: false,
  fixed: [],
  linked: [],
  access: 'restricted',
  baseBranch: 'main',
  updateInternalDependencies: 'patch',
  ignore: [],
};

/**
 * Returns the default directory of a fixture package, relative to the root.
 *
 * @param fixturePackage - The fixture package.
 * @returns The directory path.
 */
export function getFixturePackageDirectory(
  fixturePackage: ChangesetsFixturePackage,
): string {
  return (
    fixturePackage.directory ??
    path.join('packages', fixturePackage.name.replace(/^@[^/]+\//u, ''))
  );
}

/**
 * Writes a file, creating its parent directories.
 *
 * @param filePath - The path of the file.
 * @param content - The content of the file.
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

/**
 * Writes a JSON file, creating its parent directories.
 *
 * @param filePath - The path of the file.
 * @param value - The value to serialize.
 */
async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Writes a Changeset file to `.changeset/<id>.md`.
 *
 * @param rootDirectoryPath - The root of the fixture.
 * @param changeset - The Changeset to write.
 */
export async function writeChangesetFile(
  rootDirectoryPath: string,
  changeset: ChangesetsFixtureChangeset,
): Promise<void> {
  const frontmatter = Object.entries(changeset.releases)
    .map(([name, type]) => `${JSON.stringify(name)}: ${type}`)
    .join('\n');
  await writeFile(
    path.join(rootDirectoryPath, '.changeset', `${changeset.id}.md`),
    `---\n${frontmatter}\n---\n\n${changeset.summary}\n`,
  );
}

/**
 * Writes a Changesets monorepo into the given directory and commits it to a
 * new Git repository.
 *
 * @param rootDirectoryPath - The directory to write the fixture into.
 * @param options - The description of the fixture.
 */
export async function writeChangesetsFixture(
  rootDirectoryPath: string,
  options: ChangesetsFixtureOptions,
): Promise<void> {
  const {
    rootManifest = {},
    packages = [],
    changesets = [],
    config = {},
    preState,
    files = {},
  } = options;
  await writeJsonFile(path.join(rootDirectoryPath, 'package.json'), {
    name: 'root',
    version: '1.0.0',
    private: true,
    workspaces: ['packages/*'],
    ...rootManifest,
  });
  await writeFile(path.join(rootDirectoryPath, 'yarn.lock'), '');

  for (const fixturePackage of packages) {
    const { changelog, directory: _directory, ...manifest } = fixturePackage;
    const directoryPath = path.join(
      rootDirectoryPath,
      getFixturePackageDirectory(fixturePackage),
    );
    await writeJsonFile(path.join(directoryPath, 'package.json'), manifest);
    if (changelog !== undefined) {
      await writeFile(path.join(directoryPath, 'CHANGELOG.md'), changelog);
    }
  }

  await writeJsonFile(path.join(rootDirectoryPath, '.changeset/config.json'), {
    ...DEFAULT_CHANGESETS_CONFIG,
    ...config,
  });
  if (preState !== undefined) {
    await writeJsonFile(
      path.join(rootDirectoryPath, '.changeset/pre.json'),
      preState,
    );
  }
  for (const changeset of changesets) {
    await writeChangesetFile(rootDirectoryPath, changeset);
  }
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(path.join(rootDirectoryPath, relativePath), content);
  }

  const git = async (...args: string[]): Promise<void> => {
    await execa('git', args, { cwd: rootDirectoryPath });
  };
  await git('init', '-b', 'main');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test User');
  await git('config', 'commit.gpgsign', 'false');
  await git('add', '-A');
  await git('commit', '-m', 'Initial commit');
}

/**
 * Writes a Changesets monorepo into a fresh sandbox directory, runs the given
 * function, then removes the directory.
 *
 * @param options - The description of the fixture.
 * @param fn - The function to call with the root directory of the fixture.
 * @returns Whatever the given function returns.
 */
export async function withChangesetsFixture<Result>(
  options: ChangesetsFixtureOptions,
  fn: (rootDirectoryPath: string) => Promise<Result>,
): Promise<Result> {
  return await withSandbox(async ({ directoryPath }) => {
    await writeChangesetsFixture(directoryPath, options);
    return await fn(directoryPath);
  });
}
