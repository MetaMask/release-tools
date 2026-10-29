import path from 'path';

import {
  ChangesetsFixtureChangeset,
  DEFAULT_CHANGESETS_CONFIG,
  LOCAL_CHANGELOG_CONFIG,
  LOCAL_CHANGELOG_FILES,
  writeChangesetFile,
} from '../../unit/changesets-fixture.js';
import { PackageSpecification } from './environment.js';
import LocalRepo, { LocalRepoOptions } from './local-repo.js';
import { knownKeysOf } from './utils.js';

/**
 * A set of configuration options for a {@link LocalMonorepo}. In addition
 * to the options listed in {@link LocalRepoOptions}, these include:
 *
 * @property packages - The known packages within this repo (including the
 * root).
 * @property workspaces - The known workspaces within this repo.
 * @property changesets - If given, the repo uses Changesets: it gets a
 * `.changeset/config.json` that uses the local changelog module, and these
 * Changeset files.
 */
export type LocalMonorepoOptions<WorkspacePackageNickname extends string> = {
  packages: Record<WorkspacePackageNickname, PackageSpecification>;
  workspaces: Record<string, string[]>;
  changesets?: ChangesetsFixtureChangeset[] | undefined;
} & LocalRepoOptions;

/**
 * Represents the repo that the tool is run against, containing logic specific
 * to a monorepo.
 */
export default class LocalMonorepo<
  WorkspacePackageNickname extends string,
> extends LocalRepo {
  /**
   * The known packages within this repo (including the root).
   */
  readonly #packages: Record<
    '$root$' | WorkspacePackageNickname,
    PackageSpecification
  >;

  /**
   * The known workspaces within this repo.
   */
  readonly #workspaces: LocalMonorepoOptions<WorkspacePackageNickname>['workspaces'];

  /**
   * The Changeset files within this repo, if it uses Changesets.
   */
  readonly #changesets: LocalMonorepoOptions<WorkspacePackageNickname>['changesets'];

  constructor({
    packages,
    workspaces,
    changesets,
    ...rest
  }: LocalMonorepoOptions<WorkspacePackageNickname>) {
    super(rest);
    this.#changesets = changesets;
    this.#packages = {
      $root$: {
        name: 'monorepo',
        version: '2022.1.1',
        directoryPath: '.',
      },
      ...packages,
    };
    this.#workspaces = workspaces;
  }

  /**
   * Reads a file within a workspace package within the project.
   *
   * @param packageNickname - The nickname of the workspace package, as
   * identified in the `packages` options passed to
   * `withMonorepoProjectEnvironment`.
   * @param partialFilePath - The path to the desired file within the package.
   * @returns The content of the file.
   */
  async readFileWithinPackage(
    packageNickname: '$root$' | WorkspacePackageNickname,
    partialFilePath: string,
  ): Promise<string> {
    const packageDirectoryPath = this.#packages[packageNickname].directoryPath;
    return await this.readFile(
      path.join(packageDirectoryPath, partialFilePath),
    );
  }

  /**
   * Reads a JSON file within a workspace package within the project.
   *
   * @param packageNickname - The nickname of the workspace package, as
   * identified in the `packages` options passed to
   * `withMonorepoProjectEnvironment`.
   * @param partialFilePath - The path to the desired file within the package.
   * @returns The object which the JSON file holds.
   */
  async readJsonFileWithinPackage(
    packageNickname: '$root$' | WorkspacePackageNickname,
    partialFilePath: string,
  ): Promise<Record<string, unknown>> {
    const packageDirectoryPath = this.#packages[packageNickname].directoryPath;
    return await this.readJsonFile(
      path.join(packageDirectoryPath, partialFilePath),
    );
  }

  /**
   * Creates or overwrites a file within a workspace package within the project.
   *
   * @param packageNickname - The nickname of the workspace package, as
   * identified in the `packages` options passed to
   * `withMonorepoProjectEnvironment`.
   * @param partialFilePath - The path to the desired file within the package.
   * @param contents - The desired contents of the file.
   */
  async writeFileWithinPackage(
    packageNickname: '$root$' | WorkspacePackageNickname,
    partialFilePath: string,
    contents: string,
  ): Promise<void> {
    const packageDirectoryPath = this.#packages[packageNickname].directoryPath;
    await this.writeFile(
      path.join(packageDirectoryPath, partialFilePath),
      contents,
    );
  }

  /**
   * Creates or overwrites a JSON file within a workspace package within the
   * project.
   *
   * @param packageNickname - The nickname of the workspace package, as
   * identified in the `packages` options passed to
   * `withMonorepoProjectEnvironment`.
   * @param partialFilePath - The path to the desired file within the package.
   * @param object - The new object that the file should represent.
   */
  async writeJsonFileWithinPackage(
    packageNickname: '$root$' | WorkspacePackageNickname,
    partialFilePath: string,
    object: Record<string, unknown>,
  ): Promise<void> {
    const packageDirectoryPath = this.#packages[packageNickname].directoryPath;
    await this.writeJsonFile(
      path.join(packageDirectoryPath, partialFilePath),
      object,
    );
  }

  /**
   * Updates a JSON file within a workspace package within the project.
   *
   * @param packageNickname - The nickname of the workspace package, as
   * identified in the `packages` options passed to
   * `withMonorepoProjectEnvironment`.
   * @param partialFilePath - The path to the desired file within the package.
   * @param object - The new object should be merged into the file.
   */
  async updateJsonFileWithinPackage(
    packageNickname: '$root$' | WorkspacePackageNickname,
    partialFilePath: string,
    object: Record<string, unknown>,
  ): Promise<void> {
    const packageDirectoryPath = this.#packages[packageNickname].directoryPath;
    await this.updateJsonFile(
      path.join(packageDirectoryPath, partialFilePath),
      object,
    );
  }

  /**
   * Writes an initial package.json for the root package as well as any
   * workspace packages (if specified), and the Changesets files (if
   * specified).
   */
  protected async afterCreate(): Promise<void> {
    await super.afterCreate();

    await this.updateJsonFile('package.json', {
      private: true,
      packageManager: 'yarn@3.2.1',
    });

    // Update manifests for root and workspace packages with `name`, `version`,
    // and (optionally) `workspaces`
    await Promise.all(
      knownKeysOf(this.#packages).map(async (packageName) => {
        const pkg = this.#packages[packageName];
        const content = {
          name: pkg.name,
          ...('version' in pkg ? { version: pkg.version } : {}),
          ...(pkg.directoryPath in this.#workspaces
            ? { workspaces: this.#workspaces[pkg.directoryPath] }
            : {}),
        };
        return this.updateJsonFile(
          path.join(pkg.directoryPath, 'package.json'),
          content,
        );
      }),
    );

    if (this.#changesets !== undefined) {
      await this.writeJsonFile('.changeset/config.json', {
        ...DEFAULT_CHANGESETS_CONFIG,
        ...LOCAL_CHANGELOG_CONFIG,
      });
      for (const [filePath, content] of Object.entries(LOCAL_CHANGELOG_FILES)) {
        await this.writeFile(filePath, content);
      }
      for (const changeset of this.#changesets) {
        await writeChangesetFile(this.getWorkingDirectoryPath(), changeset);
      }
    }

    await this.runCommand('yarn', ['plugin', 'import', 'constraints']);
  }

  /**
   * Gets the name of the primary package that this project represents.
   *
   * @returns The name of the root package.
   */
  protected getPackageName(): string {
    return this.#packages.$root$.name;
  }

  /**
   * Gets the version of the primary package that this project represents.
   *
   * @returns The version of the root package.
   */
  protected getPackageVersion(): string | undefined {
    return this.#packages.$root$.version;
  }
}
