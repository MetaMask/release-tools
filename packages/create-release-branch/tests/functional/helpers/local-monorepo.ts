import path from 'path';
import { pathToFileURL } from 'url';

import { PackageSpecification } from './environment.js';
import LocalRepo, { LocalRepoOptions } from './local-repo.js';
import { knownKeysOf } from './utils.js';

/**
 * A Changeset file.
 *
 * @property id - The name of the file, without `.md`.
 * @property releases - The bump type for each package that it releases.
 * @property summary - The text after the front matter.
 */
export type ChangesetSpecification = {
  id: string;
  releases: Record<string, string>;
  summary: string;
};

/**
 * The source of `@metamask/changesets-changelog`, which `tsx` can load
 * without a build.
 */
const CHANGELOG_MODULE_SOURCE_PATH = path.resolve(
  import.meta.dirname,
  '../../../../changesets-changelog/src/index.ts',
);

/**
 * A set of configuration options for a {@link LocalMonorepo}. In addition
 * to the options listed in {@link LocalRepoOptions}, these include:
 *
 * @property packages - The known packages within this repo (including the
 * root).
 * @property workspaces - The known workspaces within this repo.
 * @property changesets - If given, the repo uses Changesets: it gets a
 * `.changeset/config.json` that uses `@metamask/changesets-changelog`, and
 * these Changeset files.
 */
export type LocalMonorepoOptions<WorkspacePackageNickname extends string> = {
  packages: Record<WorkspacePackageNickname, PackageSpecification>;
  workspaces: Record<string, string[]>;
  changesets?: ChangesetSpecification[] | undefined;
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
      await this.#writeChangesetsFiles(this.#changesets);
    }

    await this.runCommand('yarn', ['plugin', 'import', 'constraints']);
  }

  /**
   * Writes the Changesets configuration, the Changeset files, and a package
   * that points `@metamask/changesets-changelog` to its source. Formatting is
   * disabled so that the result does not depend on formatters found above
   * the repo.
   *
   * @param changesets - The Changeset files.
   */
  async #writeChangesetsFiles(
    changesets: ChangesetSpecification[],
  ): Promise<void> {
    await this.writeJsonFile('.changeset/config.json', {
      changelog: [
        '@metamask/changesets-changelog',
        { repository: 'example-org/example-repo' },
      ],
      commit: false,
      fixed: [],
      linked: [],
      access: 'restricted',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      ignore: [],
      format: false,
    });
    for (const { id, releases, summary } of changesets) {
      const frontMatter = Object.entries(releases)
        .map(([name, type]) => `${JSON.stringify(name)}: ${type}`)
        .join('\n');
      await this.writeFile(
        `.changeset/${id}.md`,
        `---\n${frontMatter}\n---\n\n${summary}\n`,
      );
    }

    await this.writeFile('.gitignore', 'node_modules/\n');
    await this.writeJsonFile(
      'node_modules/@metamask/changesets-changelog/package.json',
      {
        name: '@metamask/changesets-changelog',
        type: 'module',
        exports: './index.js',
      },
    );
    await this.writeFile(
      'node_modules/@metamask/changesets-changelog/index.js',
      `export { default } from '${pathToFileURL(CHANGELOG_MODULE_SOURCE_PATH).href}';\n`,
    );
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
