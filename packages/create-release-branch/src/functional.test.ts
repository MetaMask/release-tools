import { describe, expect, it } from 'vitest';

import type { ChangesetSpecification } from '../tests/functional/helpers/local-monorepo.js';
import type MonorepoEnvironment from '../tests/functional/helpers/monorepo-environment.js';
import { withMonorepoProjectEnvironment } from '../tests/functional/helpers/with.js';
import { buildChangelog } from '../tests/helpers.js';

type ChangesetsPackageNickname = 'a' | 'b' | 'c' | 'd' | 'l';

type LockfilePackageEntry = {
  name: string;
  directoryPath: string;
  specifiers?: string[];
  dependencies?: Record<string, string>;
};

const REPOSITORY_URL = 'https://github.com/example-org/example-repo';

/**
 * The pull request of the commit that adds the changesets, which their
 * changelog entries link to.
 */
const SETUP_PULL_REQUEST = 20;

/**
 * The changeset that releases `@scope/a` and `@scope/d`.
 */
const SHARED_CHANGESET: ChangesetSpecification = {
  id: 'eager-owls-fly',
  releases: { '@scope/a': 'patch', '@scope/d': 'minor' },
  summary: '## Fixed\n\n- Fix a and extend d',
};

describe('create-release-branch (functional)', () => {
  describe('against a monorepo with independent versions', () => {
    it('bumps the ordinary part of the root package and updates the versions of the specified packages according to the release spec', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '0.1.2',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.1.4',
              directoryPath: 'packages/b',
            },
            c: {
              name: '@scope/c',
              version: '2.0.13',
              directoryPath: 'packages/c',
            },
            d: {
              name: '@scope/d',
              version: '1.2.3',
              directoryPath: 'packages/d',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.updateJsonFile('package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('a', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('b', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('c', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('d', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });

          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'minor',
                c: 'patch',
                d: '1.2.4',
              },
            },
          });

          expect(await environment.readJsonFile('package.json')).toMatchObject({
            name: '@scope/monorepo',
            version: '2.0.0',
          });
          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({
            name: '@scope/a',
            version: '1.0.0',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('b', 'package.json'),
          ).toStrictEqual({
            name: '@scope/b',
            version: '1.2.0',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('c', 'package.json'),
          ).toStrictEqual({
            name: '@scope/c',
            version: '2.0.14',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('d', 'package.json'),
          ).toStrictEqual({
            name: '@scope/d',
            version: '1.2.4',
            scripts: { foo: 'bar' },
          });
        },
      );
    });

    it('bumps the backport part of the root package and updates the versions of the specified packages according to the release spec if --backport is provided', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '0.1.2',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.1.4',
              directoryPath: 'packages/b',
            },
            c: {
              name: '@scope/c',
              version: '2.0.13',
              directoryPath: 'packages/c',
            },
            d: {
              name: '@scope/d',
              version: '1.2.3',
              directoryPath: 'packages/d',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.updateJsonFile('package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('a', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('b', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('c', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });
          await environment.updateJsonFileWithinPackage('d', 'package.json', {
            scripts: {
              foo: 'bar',
            },
          });

          await environment.runTool({
            args: ['--backport'],
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'minor',
                c: 'patch',
                d: '1.2.4',
              },
            },
          });

          expect(await environment.readJsonFile('package.json')).toMatchObject({
            name: '@scope/monorepo',
            version: '1.1.0',
          });
          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({
            name: '@scope/a',
            version: '1.0.0',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('b', 'package.json'),
          ).toStrictEqual({
            name: '@scope/b',
            version: '1.2.0',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('c', 'package.json'),
          ).toStrictEqual({
            name: '@scope/c',
            version: '2.0.14',
            scripts: { foo: 'bar' },
          });
          expect(
            await environment.readJsonFileWithinPackage('d', 'package.json'),
          ).toStrictEqual({
            name: '@scope/d',
            version: '1.2.4',
            scripts: { foo: 'bar' },
          });
        },
      );
    });

    it("updates each of the specified packages' changelogs by adding a new section which lists all commits concerning the package over the entire history of the repo", async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
          createInitialCommit: false,
        },
        async (environment) => {
          // Create an initial commit
          await environment.writeFileWithinPackage(
            'a',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
          await environment.writeFileWithinPackage(
            'b',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
          await environment.createCommit('Initial commit');

          // Create another commit that only changes "a"
          await environment.writeFileWithinPackage(
            'a',
            'dummy.txt',
            'Some content',
          );
          await environment.createCommit('Update "a"');

          // Run the tool
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'major',
              },
            },
          });

          // Both changelogs should get updated, with an additional
          // commit listed for "a"
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [2.0.0]

              ### Uncategorized

              - Update "a"
              - Initial commit

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/a@2.0.0...HEAD
              [2.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/a@2.0.0
            `),
          );
          expect(
            await environment.readFileWithinPackage('b', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [2.0.0]

              ### Uncategorized

              - Initial commit

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/b@2.0.0...HEAD
              [2.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/b@2.0.0
            `),
          );
        },
      );
    });

    it('updates package changelogs with package changes since the last package release', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
          createInitialCommit: false,
        },
        async (environment) => {
          // Create an initial commit
          await environment.writeFileWithinPackage(
            'a',
            'CHANGELOG.md',
            buildChangelog(`
            ## [Unreleased]

            ## [1.0.0]

            ### Added

            - Initial release

            [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/a@1.0.0...HEAD
            [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/a@1.0.0
            `),
          );
          await environment.writeFileWithinPackage(
            'b',
            'CHANGELOG.md',
            buildChangelog(`
            ## [Unreleased]

            ## [1.0.0]

            ### Added

            - Initial release

            [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/b@1.0.0...HEAD
            [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/b@1.0.0
            `),
          );
          await environment.createCommit('Initial commit');
          await environment.runCommand('git', ['tag', '@scope/a@1.0.0']);
          await environment.runCommand('git', ['tag', '@scope/b@1.0.0']);
          await environment.runCommand('git', ['tag', 'v1.0.0']);

          // Create another commit that only changes "a"
          await environment.writeFileWithinPackage(
            'a',
            'dummy.txt',
            'Some content',
          );
          await environment.createCommit('Update "a"');

          // Run the tool
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
              },
            },
          });

          // Only "a" should be updated
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [2.0.0]

              ### Uncategorized

              - Update "a"

              ## [1.0.0]

              ### Added

              - Initial release

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/a@2.0.0...HEAD
              [2.0.0]: https://github.com/example-org/example-repo/compare/@scope/a@1.0.0...@scope/a@2.0.0
              [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/a@1.0.0
            `),
          );
          expect(
            await environment.readFileWithinPackage('b', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
            ## [Unreleased]

            ## [1.0.0]

            ### Added

            - Initial release

            [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/b@1.0.0...HEAD
            [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/b@1.0.0
            `),
          );
        },
      );
    });

    it('updates package changelogs with package changes since the last root release if this is the first package release', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '0.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
          createInitialCommit: false,
        },
        async (environment) => {
          // Create an initial commit
          await environment.writeFileWithinPackage(
            'a',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
          await environment.writeFileWithinPackage(
            'b',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              ## [1.0.0]

              ### Added

              - Initial release

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/b@1.0.0...HEAD
              [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/b@1.0.0
            `),
          );
          await environment.createCommit('Initial commit');
          await environment.runCommand('git', ['tag', '@scope/b@1.0.0']);
          await environment.runCommand('git', ['tag', 'v1.0.0']);

          // Create another commit that only changes "a"
          await environment.writeFileWithinPackage(
            'a',
            'dummy.txt',
            'Some content',
          );
          await environment.createCommit('Update "a"');

          // Run the tool
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
              },
            },
          });

          // Only "a" should be updated
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [1.0.0]

              ### Uncategorized

              - Update "a"

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/a@1.0.0...HEAD
              [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/a@1.0.0
            `),
          );
          expect(
            await environment.readFileWithinPackage('b', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [1.0.0]

              ### Added

              - Initial release

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/b@1.0.0...HEAD
              [1.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/b@1.0.0
            `),
          );
        },
      );
    });

    it('switches to a new release branch and commits the changes', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
              },
            },
          });

          // Tests five things:
          // * The latest commit should be called "Update Release 2.0.0"
          // * The before latest commit should be called "Initialize Release 2.0.0"
          // * The latest commit should be the current commit (HEAD)
          // * The latest branch should be called "release/2.0.0"
          // * The latest branch should point to the latest commit
          const latestCommitsInReverse = (
            await environment.runCommand('git', [
              'log',
              '--pretty=%s%x09%H%x09%D',
              '--date-order',
              '--max-count=2',
            ])
          ).stdout
            .split('\n')
            .map((line) => {
              const [subject, commitId, revsMarker] = line.split('\x09');
              const revs = revsMarker.split(' -> ');
              return { subject, commitId, revs };
            });
          const latestBranchCommitId = (
            await environment.runCommand('git', [
              'rev-list',
              '--branches',
              '--date-order',
              '--max-count=1',
            ])
          ).stdout;
          expect(latestCommitsInReverse[0].subject).toBe(
            'Update Release 2.0.0',
          );
          expect(latestCommitsInReverse[1].subject).toBe(
            'Initialize Release 2.0.0',
          );

          expect(latestCommitsInReverse[0].revs).toContain('HEAD');
          expect(latestCommitsInReverse[0].revs).toContain('release/2.0.0');

          expect(latestBranchCommitId).toStrictEqual(
            latestCommitsInReverse[0].commitId,
          );
        },
      );
    });

    it('updates the dependency version in package "b" when package "a" version is bumped', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '2.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.updateJsonFileWithinPackage('b', 'package.json', {
            dependencies: {
              '@scope/a': '1.0.0',
            },
          });
          const constraintsProContent = `
          % All packages must have a name and version defined.
          \\+ gen_enforced_field(_, 'name', null).
          \\+ gen_enforced_field(_, 'version', null).

          % All version ranges used to reference one workspace package in another workspace package's \`dependencies\` or \`devDependencies\` must match the current version of that package.
          gen_enforced_dependency(Pkg, DependencyIdent, CorrectDependencyRange, DependencyType) :-
            DependencyType \\= 'peerDependencies',
            workspace_has_dependency(Pkg, DependencyIdent, _, DependencyType),
            workspace_ident(DepPkg, DependencyIdent),
            workspace_version(DepPkg, DependencyVersion),
            atomic_list_concat(['^', DependencyVersion], CorrectDependencyRange),
            Pkg \\= DepPkg. % Ensure we do not add self-dependency

          % Entry point to check all constraints.
          workspace_package(Pkg) :-
            package_json(Pkg, _, _).

          enforce_all :-
            workspace_package(Pkg),
            enforce_has_name(Pkg),
            enforce_has_version(Pkg),
            (package_json(Pkg, 'dependencies', Deps) -> enforce_dependencies(Pkg, Deps) ; true).

          enforce_has_name(Pkg) :-
            package_json(Pkg, 'name', _).

          enforce_has_version(Pkg) :-
            package_json(Pkg, 'version', _).

          enforce_dependencies(_, []).
          enforce_dependencies(Pkg, [DepPkg-DepVersion | Rest]) :-
            workspace_package(DepPkg),
            package_json(DepPkg, 'version', DepVersion),
            enforce_dependency_version(Pkg, DepPkg),
            enforce_dependencies(Pkg, Rest).

          enforce_dependency_version(Pkg, DepPkg) :-
            package_json(Pkg, 'dependencies', Deps),
            package_json(DepPkg, 'version', DepVersion),
            member(DepPkg-DepVersion, Deps).

          update_dependency_version(Pkg, DepPkg) :-
            package_json(Pkg, 'dependencies', Deps),
            package_json(DepPkg, 'version', DepVersion),
            \\+ member(DepPkg-DepVersion, Deps),
            Pkg \\= DepPkg, % Ensure we do not add self-dependency
            set_package_json(Pkg, 'dependencies', DepPkg, DepVersion).
          `;

          await environment.writeFile('constraints.pro', constraintsProContent);
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'intentionally-skip',
              },
            },
          });

          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({
            name: '@scope/a',
            version: '2.0.0',
          });
          expect(
            await environment.readJsonFileWithinPackage('b', 'package.json'),
          ).toStrictEqual({
            name: '@scope/b',
            version: '2.0.0',
            dependencies: { '@scope/a': '^2.0.0' },
          });
        },
      );
    });

    it('updates the yarn lock file', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '2.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.updateJsonFileWithinPackage('b', 'package.json', {
            dependencies: {
              '@scope/a': '1.0.0',
            },
          });
          const constraintsProContent = `
          % All packages must have a name and version defined.
          \\+ gen_enforced_field(_, 'name', null).
          \\+ gen_enforced_field(_, 'version', null).

          % All version ranges used to reference one workspace package in another workspace package's \`dependencies\` or \`devDependencies\` must match the current version of that package.
          gen_enforced_dependency(Pkg, DependencyIdent, CorrectDependencyRange, DependencyType) :-
            DependencyType \\= 'peerDependencies',
            workspace_has_dependency(Pkg, DependencyIdent, _, DependencyType),
            workspace_ident(DepPkg, DependencyIdent),
            workspace_version(DepPkg, DependencyVersion),
            atomic_list_concat(['^', DependencyVersion], CorrectDependencyRange),
            Pkg \\= DepPkg. % Ensure we do not add self-dependency

          % Entry point to check all constraints.
          workspace_package(Pkg) :-
            package_json(Pkg, _, _).

          enforce_all :-
            workspace_package(Pkg),
            enforce_has_name(Pkg),
            enforce_has_version(Pkg),
            (package_json(Pkg, 'dependencies', Deps) -> enforce_dependencies(Pkg, Deps) ; true).

          enforce_has_name(Pkg) :-
            package_json(Pkg, 'name', _).

          enforce_has_version(Pkg) :-
            package_json(Pkg, 'version', _).

          enforce_dependencies(_, []).
          enforce_dependencies(Pkg, [DepPkg-DepVersion | Rest]) :-
            workspace_package(DepPkg),
            package_json(DepPkg, 'version', DepVersion),
            enforce_dependency_version(Pkg, DepPkg),
            enforce_dependencies(Pkg, Rest).

          enforce_dependency_version(Pkg, DepPkg) :-
            package_json(Pkg, 'dependencies', Deps),
            package_json(DepPkg, 'version', DepVersion),
            member(DepPkg-DepVersion, Deps).

          update_dependency_version(Pkg, DepPkg) :-
            package_json(Pkg, 'dependencies', Deps),
            package_json(DepPkg, 'version', DepVersion),
            \\+ member(DepPkg-DepVersion, Deps),
            Pkg \\= DepPkg, % Ensure we do not add self-dependency
            set_package_json(Pkg, 'dependencies', DepPkg, DepVersion).
          `;
          await environment.writeFile('constraints.pro', constraintsProContent);
          const outdatedLockfile = `
          # This file is generated by running "yarn install" inside your project.
          # Manual changes might be lost - proceed with caution!

          __metadata:
            version: 6

          "@scope/a@^1.0.0, @scope/a@workspace:packages/a":
            version: 0.0.0-use.local
            resolution: "@scope/a@workspace:packages/a"
            languageName: unknown
            linkType: soft

          "@scope/b@workspace:packages/b":
            version: 0.0.0-use.local
            resolution: "@scope/b@workspace:packages/b"
            dependencies:
              "@scope/a": ^1.0.0
            languageName: unknown
            linkType: soft

          "@scope/monorepo@workspace:.":
            version: 0.0.0-use.local
            resolution: "@scope/monorepo@workspace:."
            languageName: unknown
            linkType: soft`;
          await environment.writeFile('yarn.lock', outdatedLockfile);
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'intentionally-skip',
              },
            },
          });

          const updatedLockfile = `# This file is generated by running "yarn install" inside your project.
# Manual changes might be lost - proceed with caution!

__metadata:
  version: 6

"@scope/a@^2.0.0, @scope/a@workspace:packages/a":
  version: 0.0.0-use.local
  resolution: "@scope/a@workspace:packages/a"
  languageName: unknown
  linkType: soft

"@scope/b@workspace:packages/b":
  version: 0.0.0-use.local
  resolution: "@scope/b@workspace:packages/b"
  dependencies:
    "@scope/a": ^2.0.0
  languageName: unknown
  linkType: soft

"@scope/monorepo@workspace:.":
  version: 0.0.0-use.local
  resolution: "@scope/monorepo@workspace:."
  languageName: unknown
  linkType: soft
`;

          expect(await environment.readFile('yarn.lock')).toStrictEqual(
            updatedLockfile,
          );
        },
      );
    });

    it('does not update the versions of any packages that have been tagged with intentionally-skip', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '0.1.2',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.1.4',
              directoryPath: 'packages/b',
            },
            c: {
              name: '@scope/c',
              version: '2.0.13',
              directoryPath: 'packages/c',
            },
            d: {
              name: '@scope/d',
              version: '1.2.3',
              directoryPath: 'packages/d',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
        },
        async (environment) => {
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'intentionally-skip',
                c: 'patch',
                d: 'intentionally-skip',
              },
            },
          });

          expect(await environment.readJsonFile('package.json')).toMatchObject({
            name: '@scope/monorepo',
            version: '2.0.0',
          });
          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({
            name: '@scope/a',
            version: '1.0.0',
          });
          expect(
            await environment.readJsonFileWithinPackage('b', 'package.json'),
          ).toStrictEqual({
            name: '@scope/b',
            version: '1.1.4',
          });
          expect(
            await environment.readJsonFileWithinPackage('c', 'package.json'),
          ).toStrictEqual({
            name: '@scope/c',
            version: '2.0.14',
          });
          expect(
            await environment.readJsonFileWithinPackage('d', 'package.json'),
          ).toStrictEqual({
            name: '@scope/d',
            version: '1.2.3',
          });
        },
      );
    });

    it('does not update the changelogs of any packages that have been tagged with intentionally-skip', async () => {
      await withMonorepoProjectEnvironment(
        {
          packages: {
            $root$: {
              name: '@scope/monorepo',
              version: '1.0.0',
              directoryPath: '.',
            },
            a: {
              name: '@scope/a',
              version: '1.0.0',
              directoryPath: 'packages/a',
            },
            b: {
              name: '@scope/b',
              version: '1.0.0',
              directoryPath: 'packages/b',
            },
          },
          workspaces: {
            '.': ['packages/*'],
          },
          createInitialCommit: false,
        },
        async (environment) => {
          // Create an initial commit
          await environment.writeFileWithinPackage(
            'a',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
          await environment.writeFileWithinPackage(
            'b',
            'CHANGELOG.md',
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
          await environment.createCommit('Initial commit');

          // Create another commit that only changes "a"
          await environment.writeFileWithinPackage(
            'a',
            'dummy.txt',
            'Some content',
          );
          await environment.createCommit('Update "a"');

          // Run the tool
          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'major',
                b: 'intentionally-skip',
              },
            },
          });

          // Only "a" should get updated
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              ## [2.0.0]

              ### Uncategorized

              - Update "a"
              - Initial commit

              [Unreleased]: https://github.com/example-org/example-repo/compare/@scope/a@2.0.0...HEAD
              [2.0.0]: https://github.com/example-org/example-repo/releases/tag/@scope/a@2.0.0
            `),
          );
          expect(
            await environment.readFileWithinPackage('b', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
              ## [Unreleased]

              [Unreleased]: https://github.com/example-org/example-repo
            `),
          );
        },
      );
    });
  });

  describe('against a monorepo using Changesets', () => {
    it('releases every pending changeset, then commits the release', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        const rootChangelogBefore = await environment.readFile('CHANGELOG.md');
        const changelogOfLBefore = await environment.readFileWithinPackage(
          'l',
          'CHANGELOG.md',
        );

        await environment.runTool({
          releaseSpecification: {
            packages: {
              a: 'minor',
              b: 'major',
              c: 'patch',
              d: 'minor',
            },
          },
        });

        expect(await environment.readJsonFile('package.json')).toMatchObject({
          name: '@scope/monorepo',
          version: '2.0.0',
        });
        expect(await environment.readFile('CHANGELOG.md')).toBe(
          rootChangelogBefore,
        );
        expect(
          await environment.readJsonFileWithinPackage('a', 'package.json'),
        ).toStrictEqual({ name: '@scope/a', version: '1.1.0' });
        expect(
          await environment.readJsonFileWithinPackage('b', 'package.json'),
        ).toStrictEqual({ name: '@scope/b', version: '2.0.0' });
        expect(
          await environment.readJsonFileWithinPackage('c', 'package.json'),
        ).toStrictEqual({
          name: '@scope/c',
          version: '1.0.1',
          dependencies: { '@scope/b': '^2.0.0' },
        });
        expect(
          await environment.readJsonFileWithinPackage('d', 'package.json'),
        ).toStrictEqual({ name: '@scope/d', version: '0.2.0' });
        expect(
          await environment.readJsonFileWithinPackage('l', 'package.json'),
        ).toStrictEqual({ name: '@scope/l', version: '1.0.0' });

        expect(
          await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
        ).toStrictEqual(
          buildChangelog(`
            ## [1.1.0]

            ### Added

            - Add a feature to a (${buildPullRequestLink(SETUP_PULL_REQUEST)})

            ### Fixed

            - Fix a and extend d (${buildPullRequestLink(SETUP_PULL_REQUEST)})

            ## [1.0.0]

            ### Added

            - Initial release (${buildPullRequestLink(0)})

            [1.1.0]: ${REPOSITORY_URL}/compare/@scope/a@1.0.0...@scope/a@1.1.0
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/a@1.0.0
          `),
        );
        expect(
          await environment.readFileWithinPackage('b', 'CHANGELOG.md'),
        ).toStrictEqual(
          buildChangelog(`
            ## [2.0.0]

            ### Removed

            - **BREAKING:** Remove the old API of b (${buildPullRequestLink(SETUP_PULL_REQUEST)})

            [2.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/b@2.0.0
          `),
        );
        expect(
          await environment.readFileWithinPackage('c', 'CHANGELOG.md'),
        ).toStrictEqual(
          buildChangelog(`
            ## [1.0.1]

            ### Changed

            - Bump \`@scope/b\` from \`1.0.0\` to \`2.0.0\`

            ## [1.0.0]

            ### Added

            - Initial release (${buildPullRequestLink(0)})

            [1.0.1]: ${REPOSITORY_URL}/compare/@scope/c@1.0.0...@scope/c@1.0.1
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/c@1.0.0
          `),
        );
        expect(
          await environment.readFileWithinPackage('l', 'CHANGELOG.md'),
        ).toBe(changelogOfLBefore);

        expect(await listChangesetDirectory(environment)).toStrictEqual([
          'config.json',
        ]);
        expect(await environment.readFile('yarn.lock')).toStrictEqual(
          buildYarnLockfile([
            { name: '@scope/a', directoryPath: 'packages/a' },
            {
              name: '@scope/b',
              directoryPath: 'packages/b',
              specifiers: ['@scope/b@^2.0.0'],
            },
            {
              name: '@scope/c',
              directoryPath: 'packages/c',
              dependencies: { '@scope/b': '^2.0.0' },
            },
            { name: '@scope/d', directoryPath: 'packages/d' },
            { name: '@scope/l', directoryPath: 'packages/l' },
            { name: '@scope/monorepo', directoryPath: '.' },
          ]),
        );
        expect(await readLatestCommitSubjects(environment, 2)).toStrictEqual([
          'Update Release 2.0.0',
          'Initialize Release 2.0.0',
        ]);
        expect(
          (
            await environment.runCommand('git', [
              'rev-parse',
              '--abbrev-ref',
              'HEAD',
            ])
          ).stdout,
        ).toBe('release/2.0.0');
        expect(await readStatus(environment)).toBe('');
      });
    });

    it('keeps the changesets of a package that the release spec leaves out', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        await environment.runTool({
          releaseSpecification: {
            packages: {
              a: 'minor',
              b: 'major',
              c: 'patch',
            },
          },
        });

        expect(
          await environment.readJsonFileWithinPackage('a', 'package.json'),
        ).toStrictEqual({ name: '@scope/a', version: '1.1.0' });
        expect(
          await environment.readJsonFileWithinPackage('d', 'package.json'),
        ).toStrictEqual({ name: '@scope/d', version: '0.1.0' });
        expect(
          await environment.readJsonFileWithinPackage('l', 'package.json'),
        ).toStrictEqual({ name: '@scope/l', version: '1.0.0' });
        expect(await listChangesetDirectory(environment)).toStrictEqual([
          'config.json',
          'eager-owls-fly.md',
        ]);
        expect(await environment.readFile('.changeset/eager-owls-fly.md')).toBe(
          `---\n"@scope/d": minor\n---\n${SHARED_CHANGESET.summary}`,
        );
        expect(await readStatus(environment)).toBe('');
      });
    });

    it('stops if the release spec changes the version that the changesets give, and changes no package', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        const changesetsBefore = await listChangesetDirectory(environment);

        const promise = environment.runTool({
          releaseSpecification: {
            packages: {
              a: 'major',
              b: 'major',
              c: 'patch',
              d: 'minor',
            },
          },
        });

        await expect(promise).rejects.toThrow(
          /is set to major, but the changesets release it as 1\.1\.0/u,
        );
        expect(
          await environment.readJsonFileWithinPackage('a', 'package.json'),
        ).toStrictEqual({ name: '@scope/a', version: '1.0.0' });
        expect(await listChangesetDirectory(environment)).toStrictEqual(
          changesetsBefore,
        );
      });
    });

    it('stops if a released package has entries in Unreleased, and changes no package', async () => {
      const changelogOfA = buildChangelog(`
        ## [Unreleased]

        ### Added

        - Add a legacy feature to a (${buildPullRequestLink(1)})

        ## [1.0.0]

        ### Added

        - Initial release (${buildPullRequestLink(0)})

        [Unreleased]: ${REPOSITORY_URL}/compare/@scope/a@1.0.0...HEAD
        [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/a@1.0.0
      `);
      await withChangesetsMonorepo(
        { files: { 'packages/a/CHANGELOG.md': changelogOfA } },
        async (environment) => {
          const changesetsBefore = await listChangesetDirectory(environment);

          const promise = environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'minor',
                b: 'major',
                c: 'patch',
                d: 'minor',
              },
            },
          });

          await expect(promise).rejects.toThrow(
            /1 changelog has entries in Unreleased:/u,
          );
          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({ name: '@scope/a', version: '1.0.0' });
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toBe(changelogOfA);
          expect(await listChangesetDirectory(environment)).toStrictEqual(
            changesetsBefore,
          );
        },
      );
    });

    it('stops before the first commit of the release if the .changeset directory has uncommitted changes', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        await environment.writeFile(
          '.changeset/quiet-foxes-hide.md',
          '---\n"@scope/a": patch\n---\n\n## Fixed\n\n- Fix a again\n',
        );

        const promise = environment.runTool({
          releaseSpecification: {
            packages: { a: 'minor', b: 'major', c: 'patch', d: 'minor' },
          },
        });

        await expect(promise).rejects.toThrow(
          /The \.changeset directory has uncommitted changes\./u,
        );
        expect(await readLatestCommitSubjects(environment, 1)).toStrictEqual([
          `Set up the monorepo (#${SETUP_PULL_REQUEST})`,
        ]);
        expect(await readStatus(environment)).toBe(
          '?? .changeset/quiet-foxes-hide.md',
        );
      });
    });

    it('releases a committed changeset whose commit has no pull request number, without a link', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        await environment.writeFile(
          '.changeset/quiet-foxes-hide.md',
          '---\n"@scope/a": patch\n---\n\n## Fixed\n\n- Fix a again\n',
        );
        await environment.createCommit('Add a changeset for a');

        await environment.runTool({
          releaseSpecification: {
            packages: { a: 'minor', b: 'major', c: 'patch', d: 'minor' },
          },
        });

        expect(
          await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
        ).toContain('- Fix a again\n');
        expect(await listChangesetDirectory(environment)).toStrictEqual([
          'config.json',
        ]);
      });
    });

    it('stops with the recovery command if the release cannot be applied, and changes no file', async () => {
      await withChangesetsMonorepo(
        {
          changesets: [
            {
              id: 'sharp-bees-buzz',
              releases: { '@scope/a': 'patch' },
              summary: 'A summary without a category',
            },
          ],
        },
        async (environment) => {
          const changesetsBefore = await listChangesetDirectory(environment);

          const promise = environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'minor',
                b: 'major',
                c: 'patch',
                d: 'minor',
              },
            },
          });

          await expect(promise).rejects.toThrow(
            /The release could not be applied\./u,
          );
          await expect(promise).rejects.toThrow(
            /git stash --include-untracked/u,
          );
          expect(await listChangesetDirectory(environment)).toStrictEqual(
            changesetsBefore,
          );
          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({ name: '@scope/a', version: '1.0.0' });
          // The temporary directory keeps the release spec for the next run.
          expect(await readStatus(environment)).toBe('?? tmp/');
        },
      );
    });

    it('follows the legacy workflow if Changesets mode is not chosen', async () => {
      await withChangesetsMonorepo(
        { files: { 'release.config.json': '{}\n' } },
        async (environment) => {
          const changesetsBefore = await listChangesetDirectory(environment);

          await environment.runTool({
            releaseSpecification: {
              packages: {
                a: 'minor',
                l: 'patch',
              },
            },
          });

          expect(
            await environment.readJsonFileWithinPackage('a', 'package.json'),
          ).toStrictEqual({ name: '@scope/a', version: '1.1.0' });
          expect(
            await environment.readJsonFileWithinPackage('b', 'package.json'),
          ).toStrictEqual({ name: '@scope/b', version: '1.0.0' });
          expect(
            await environment.readFileWithinPackage('a', 'CHANGELOG.md'),
          ).toStrictEqual(
            buildChangelog(`
            ## [Unreleased]

            ## [1.1.0]

            ### Uncategorized

            - Set up the monorepo (${buildPullRequestLink(20)})

            ## [1.0.0]

            ### Added

            - Initial release (${buildPullRequestLink(0)})

            [Unreleased]: ${REPOSITORY_URL}/compare/@scope/a@1.1.0...HEAD
            [1.1.0]: ${REPOSITORY_URL}/compare/@scope/a@1.0.0...@scope/a@1.1.0
            [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/a@1.0.0
          `),
          );
          expect(await listChangesetDirectory(environment)).toStrictEqual(
            changesetsBefore,
          );
        },
      );
    });

    it('fails without changing the working tree if --interactive is given', async () => {
      await withChangesetsMonorepo({}, async (environment) => {
        const headBefore = (
          await environment.runCommand('git', ['rev-parse', 'HEAD'])
        ).stdout;

        await expect(
          environment.runTool({
            args: ['--interactive'],
            releaseSpecification: { packages: {} },
          }),
        ).rejects.toThrow(
          /The interactive UI does not support Changesets mode yet\./u,
        );

        expect(
          (await environment.runCommand('git', ['rev-parse', 'HEAD'])).stdout,
        ).toBe(headBefore);
        expect(
          (
            await environment.runCommand('git', [
              'rev-parse',
              '--abbrev-ref',
              'HEAD',
            ])
          ).stdout,
        ).toBe('main');
        expect(await readStatus(environment)).toBe('');
      });
    });
  });
});

/**
 * Builds a link to a pull request of the repository of the functional tests.
 *
 * @param pullRequest - The number of the pull request.
 * @returns The Markdown link.
 */
function buildPullRequestLink(pullRequest: number): string {
  return `[#${pullRequest}](${REPOSITORY_URL}/pull/${pullRequest})`;
}

/**
 * Builds a `yarn.lock` skeleton from the given workspace package entries.
 *
 * @param entries - The workspace package entries to include in the lockfile.
 * @returns The content of `yarn.lock`.
 */
function buildYarnLockfile(entries: LockfilePackageEntry[]): string {
  const lines = [
    '# This file is generated by running "yarn install" inside your project.',
    '# Manual changes might be lost - proceed with caution!',
    '',
    '__metadata:',
    '  version: 6',
  ];

  for (const {
    name,
    directoryPath,
    specifiers = [],
    dependencies,
  } of entries) {
    const keys = [...specifiers, `${name}@workspace:${directoryPath}`].join(
      ', ',
    );
    const dependencyLines = dependencies
      ? [
          '  dependencies:',
          ...Object.entries(dependencies).map(
            ([depName, range]) => `    ${JSON.stringify(depName)}: ${range}`,
          ),
        ]
      : [];

    lines.push(
      '',
      `${JSON.stringify(keys)}:`,
      '  version: 0.0.0-use.local',
      `  resolution: "${name}@workspace:${directoryPath}"`,
      ...dependencyLines,
      '  languageName: unknown',
      '  linkType: soft',
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Builds a monorepo that uses Changesets and commits all of its files, then
 * calls the given function with it. The monorepo has:
 *
 * - `a`, released by a minor changeset, with an empty `Unreleased` section;
 * - `b`, released by a major changeset, without a changelog;
 * - `c`, which depends on `b`, with an empty `Unreleased` section;
 * - `d`, released with `a` by a shared changeset;
 * - `l`, which only has hand-written `Unreleased` entries.
 *
 * @param options - The options.
 * @param options.changesets - Changesets to add to the default ones.
 * @param options.files - Other files to write, by path relative to the root.
 * @param callback - The function to call with the environment.
 * @returns Whatever the callback returns.
 */
async function withChangesetsMonorepo<CallbackReturnValue>(
  {
    changesets = [],
    files = {},
  }: {
    changesets?: ChangesetSpecification[];
    files?: Record<string, string>;
  },
  callback: (
    environment: MonorepoEnvironment<ChangesetsPackageNickname>,
  ) => Promise<CallbackReturnValue>,
): Promise<CallbackReturnValue> {
  return await withMonorepoProjectEnvironment(
    {
      packages: {
        $root$: {
          name: '@scope/monorepo',
          version: '1.0.0',
          directoryPath: '.',
        },
        a: { name: '@scope/a', version: '1.0.0', directoryPath: 'packages/a' },
        b: { name: '@scope/b', version: '1.0.0', directoryPath: 'packages/b' },
        c: { name: '@scope/c', version: '1.0.0', directoryPath: 'packages/c' },
        d: { name: '@scope/d', version: '0.1.0', directoryPath: 'packages/d' },
        l: { name: '@scope/l', version: '1.0.0', directoryPath: 'packages/l' },
      },
      workspaces: {
        '.': ['packages/*'],
      },
      changesets: [
        {
          id: 'brave-cats-sing',
          releases: { '@scope/a': 'minor' },
          summary: '## Added\n\n- Add a feature to a',
        },
        {
          id: 'calm-dogs-run',
          releases: { '@scope/b': 'major' },
          summary: '## Removed\n\n- Remove the old API of b',
        },
        SHARED_CHANGESET,
        ...changesets,
      ],
      createInitialCommit: false,
    },
    async (environment) => {
      await environment.writeFileWithinPackage(
        'a',
        'CHANGELOG.md',
        buildChangelog(`
          ## [Unreleased]

          ## [1.0.0]

          ### Added

          - Initial release (${buildPullRequestLink(0)})

          [Unreleased]: ${REPOSITORY_URL}/compare/@scope/a@1.0.0...HEAD
          [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/a@1.0.0
        `),
      );
      await environment.updateJsonFileWithinPackage('c', 'package.json', {
        dependencies: { '@scope/b': '^1.0.0' },
      });
      await environment.writeFileWithinPackage(
        'c',
        'CHANGELOG.md',
        buildChangelog(`
          ## [Unreleased]

          ## [1.0.0]

          ### Added

          - Initial release (${buildPullRequestLink(0)})

          [Unreleased]: ${REPOSITORY_URL}/compare/@scope/c@1.0.0...HEAD
          [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/c@1.0.0
        `),
      );
      await environment.writeFileWithinPackage(
        'l',
        'CHANGELOG.md',
        buildChangelog(`
          ## [Unreleased]

          ### Fixed

          - Fix a legacy bug in l (${buildPullRequestLink(2)})

          ## [1.0.0]

          ### Added

          - Initial release (${buildPullRequestLink(0)})

          [Unreleased]: ${REPOSITORY_URL}/compare/@scope/l@1.0.0...HEAD
          [1.0.0]: ${REPOSITORY_URL}/releases/tag/@scope/l@1.0.0
        `),
      );
      await environment.writeFile(
        'yarn.lock',
        buildYarnLockfile([
          { name: '@scope/a', directoryPath: 'packages/a' },
          {
            name: '@scope/b',
            directoryPath: 'packages/b',
            specifiers: ['@scope/b@^1.0.0'],
          },
          {
            name: '@scope/c',
            directoryPath: 'packages/c',
            dependencies: { '@scope/b': '^1.0.0' },
          },
          { name: '@scope/d', directoryPath: 'packages/d' },
          { name: '@scope/l', directoryPath: 'packages/l' },
          { name: '@scope/monorepo', directoryPath: '.' },
        ]),
      );
      for (const [filePath, content] of Object.entries({
        'release.config.json': '{ "mode": "changesets" }\n',
        ...files,
      })) {
        await environment.writeFile(filePath, content);
      }
      await environment.createCommit(
        `Set up the monorepo (#${SETUP_PULL_REQUEST})`,
      );
      return await callback(environment);
    },
  );
}

/**
 * Reads the subjects of the latest commits, newest first.
 *
 * @param environment - The environment.
 * @param count - The number of commits to read.
 * @returns The subjects.
 */
async function readLatestCommitSubjects(
  environment: MonorepoEnvironment<ChangesetsPackageNickname>,
  count: number,
): Promise<string[]> {
  const { stdout } = await environment.runCommand('git', [
    'log',
    '--pretty=%s',
    `--max-count=${count}`,
  ]);
  return stdout.split('\n');
}

/**
 * Lists the files in the `.changeset` directory.
 *
 * @param environment - The environment.
 * @returns The file names, sorted.
 */
async function listChangesetDirectory(
  environment: MonorepoEnvironment<ChangesetsPackageNickname>,
): Promise<string[]> {
  const { stdout } = await environment.runCommand('ls', ['.changeset']);
  return stdout.split('\n');
}

/**
 * Reads the status of the working tree.
 *
 * @param environment - The environment.
 * @returns The output of `git status --porcelain`.
 */
async function readStatus(
  environment: MonorepoEnvironment<ChangesetsPackageNickname>,
): Promise<string> {
  return (await environment.runCommand('git', ['status', '--porcelain']))
    .stdout;
}
