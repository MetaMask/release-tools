import fs from 'fs';
import path from 'path';
import { SemVer } from 'semver';
import { describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

import { withSandbox } from '../../../tests/helpers.js';
import {
  buildMockProject,
  buildMockPackage,
} from '../../../tests/unit/helpers.js';
import { checkChoices } from '../../core/release-steps.js';
import type { VersionSpecifiers } from '../../core/types.js';
import { listLegacyCandidates } from '../../modes/legacy/candidates.js';
import { createLegacyMode } from '../../modes/legacy/legacy-mode.js';
import type { Project } from '../../project/project.js';
import * as miscUtils from '../../utils/misc-utils.js';
import {
  generateReleaseSpecificationTemplateForMonorepo,
  ReleaseSpecificationError,
  waitForUserToEditReleaseSpecification,
  validateReleaseSpecification as validateReleaseSpecificationWithCheck,
} from './release-specification.js';

vi.mock('../../utils/misc-utils', async () => {
  return {
    ...(await vi.importActual('../../utils/misc-utils')),
    runCommand: vi.fn(),
  };
});

/**
 * Validates the release spec the way the editor workflow does in the legacy
 * mode.
 *
 * @param project - Information about the whole project.
 * @param releaseSpecificationPath - The path to the release spec file.
 * @returns The version specifier for each package to release, and the path.
 */
async function validateReleaseSpecification(
  project: Project,
  releaseSpecificationPath: string,
): Promise<{ packages: VersionSpecifiers; path: string }> {
  const mode = createLegacyMode({
    project,
    defaultBranch: 'main',
    formatter: 'prettier',
  });
  const { data } = await validateReleaseSpecificationWithCheck(
    releaseSpecificationPath,
    async (choices) => await checkChoices({ project, mode, choices }),
  );
  return { packages: data, path: releaseSpecificationPath };
}

describe('release-specification', () => {
  describe('generateReleaseSpecificationTemplateForMonorepo', () => {
    it('returns a YAML-encoded string which has a list of all workspace packages in the project which have been changed since their latest releases', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', {
            hasChangesSinceLatestRelease: false,
          }),
          c: buildMockPackage('c', {
            hasChangesSinceLatestRelease: true,
          }),
        },
      });

      const template = await generateReleaseSpecificationTemplateForMonorepo({
        modeName: 'legacy',
        candidates: listLegacyCandidates(project),
        isEditorAvailable: true,
      });

      expect(template).toStrictEqual(
        `
# This file (called the "release spec") allows you to specify which packages you
# want to include in this release along with the new versions they should
# receive.
#
# By default, all packages which have changed since their latest release are
# listed here. You can choose not to publish a package by removing it from this
# list.
#
# For each package you *do* want to release, you will need to specify how that
# version should be changed depending on the impact of the changes that will go
# into the release. To help you make this decision, all of the changes have been
# automatically added to the changelog for the package. This has been done
# in a new commit, so you can keep this file open, run \`git show\` in the
# terminal, review the set of changes, then return to this file to specify the
# version.
#
# A version specifier (the value that goes after each package in the list below)
# can be one of the following:
#
# - "major" (if you want to bump the major part of the package's version)
# - "minor" (if you want to bump the minor part of the package's version)
# - "patch" (if you want to bump the patch part of the package's version)
# - an exact version with major, minor, and patch parts (e.g. "1.2.3")
#
# When you're finished, save this file and close it. The tool will update the
# versions of the packages you've listed and will move the changelog entries to
# a new section.

packages:
  a: null
  c: null
`.trimStart(),
      );
    });

    it('throws if no packages have been changed', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a', {
            hasChangesSinceLatestRelease: false,
          }),
          b: buildMockPackage('b', {
            hasChangesSinceLatestRelease: false,
          }),
        },
      });

      await expect(
        generateReleaseSpecificationTemplateForMonorepo({
          modeName: 'legacy',
          candidates: listLegacyCandidates(project),
          isEditorAvailable: false,
        }),
      ).rejects.toThrow(
        'Could not generate release specification: There are no packages that have changed since their latest release.',
      );
    });

    it('adjusts the instructions slightly if an editor is not available', async () => {
      const project = buildMockProject({
        rootPackage: buildMockPackage('monorepo'),
        workspacePackages: {
          a: buildMockPackage('a', {
            hasChangesSinceLatestRelease: true,
          }),
          b: buildMockPackage('b', {
            hasChangesSinceLatestRelease: true,
          }),
        },
      });

      const template = await generateReleaseSpecificationTemplateForMonorepo({
        modeName: 'legacy',
        candidates: listLegacyCandidates(project),
        isEditorAvailable: false,
      });

      expect(template).toStrictEqual(
        `
# This file (called the "release spec") allows you to specify which packages you
# want to include in this release along with the new versions they should
# receive.
#
# By default, all packages which have changed since their latest release are
# listed here. You can choose not to publish a package by removing it from this
# list.
#
# For each package you *do* want to release, you will need to specify how that
# version should be changed depending on the impact of the changes that will go
# into the release. To help you make this decision, all of the changes have been
# automatically added to the changelog for the package. This has been done
# in a new commit, so you can keep this file open, run \`git show\` in the
# terminal, review the set of changes, then return to this file to specify the
# version.
#
# A version specifier (the value that goes after each package in the list below)
# can be one of the following:
#
# - "major" (if you want to bump the major part of the package's version)
# - "minor" (if you want to bump the minor part of the package's version)
# - "patch" (if you want to bump the patch part of the package's version)
# - an exact version with major, minor, and patch parts (e.g. "1.2.3")
#
# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed and will move
# the changelog entries to a new section.

packages:
  a: null
  b: null
`.trimStart(),
      );
    });
  });

  describe('waitForUserToEditReleaseSpecification', () => {
    it('waits for the given editor command to complete successfully', async () => {
      const releaseSpecificationPath = '/path/to/release-spec';
      const editor = {
        path: '/path/to/editor',
        args: ['arg1', 'arg2'],
      };
      vi.when(vi.spyOn(miscUtils, 'runCommand'))
        .calledWith(
          '/path/to/editor',
          ['arg1', 'arg2', releaseSpecificationPath],
          {
            stdio: 'inherit',
          },
        )
        .thenResolve();

      expect(
        await waitForUserToEditReleaseSpecification(
          releaseSpecificationPath,
          editor,
        ),
      ).toBeUndefined();
    });

    it('runs the editor without a shell', async () => {
      const releaseSpecificationPath = '/path/to/release spec $(touch x)';
      const editor = { path: '/path/to/editor', args: ['--wait'] };
      const runCommandSpy = vi
        .spyOn(miscUtils, 'runCommand')
        .mockResolvedValue();

      await waitForUserToEditReleaseSpecification(
        releaseSpecificationPath,
        editor,
      );

      expect(runCommandSpy).toHaveBeenCalledWith(
        '/path/to/editor',
        ['--wait', releaseSpecificationPath],
        { stdio: 'inherit' },
      );
    });

    it('throws if the given editor command fails', async () => {
      const releaseSpecificationPath = '/path/to/release-spec';
      const editor = {
        path: '/path/to/editor',
        args: ['arg1', 'arg2'],
      };
      const error = new Error('oops');
      vi.when(vi.spyOn(miscUtils, 'runCommand'))
        .calledWith(
          '/path/to/editor',
          ['arg1', 'arg2', releaseSpecificationPath],
          {
            stdio: 'inherit',
          },
        )
        .thenReject(error);

      await expect(
        waitForUserToEditReleaseSpecification(releaseSpecificationPath, editor),
      ).rejects.toThrow(
        expect.objectContaining({
          message:
            'Encountered an error while waiting for the release spec to be edited.',
          cause: error,
        }),
      );
    });
  });

  describe('validateReleaseSpecification', () => {
    it('reads the release spec file and returns an expanded, typed version of its contents', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a'),
            b: buildMockPackage('b'),
            c: buildMockPackage('c'),
            d: buildMockPackage('d'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: 'minor',
              c: 'patch',
              d: '1.2.3',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'major',
            b: 'minor',
            c: 'patch',
            d: new SemVer('1.2.3'),
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('removes packages from the release spec which have "null" as their version specifier', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a'),
            b: buildMockPackage('b'),
            c: buildMockPackage('c'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: null,
              c: 'patch',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'major',
            c: 'patch',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('removes packages from the release spec which have "intentionally-skip" as their version specifier', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a'),
            b: buildMockPackage('b'),
            c: buildMockPackage('c'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: 'intentionally-skip',
              c: 'patch',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'major',
            c: 'patch',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('throws if the release spec cannot be parsed as valid YAML', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'foo: "bar');

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                problem: 'is not valid YAML',
                hint: 'Fix the syntax: Missing closing "quote at line 1, column 10',
              },
            ],
            specPath: releaseSpecificationPath,
            cause: expect.objectContaining({
              message: expect.stringMatching(
                /^Missing closing "quote/u,
              ) as string,
            }) as Error,
          }),
        );
      });
    });

    it('rethrows an error that is not about the YAML syntax', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(releaseSpecificationPath, 'packages: {}');
        const error = new Error('oops');
        vi.spyOn(YAML, 'parse').mockImplementation(() => {
          throw error;
        });

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toBe(error);
      });
    });

    it('throws if the release spec does not hold an object', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify(12345),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                problem:
                  'needs a packages object, where each key is a package name and each value is a version specifier',
              },
            ],
          }),
        );
      });
    });

    it('throws if the release spec holds an object but it does not have a "packages" property', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject();
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({ foo: 'bar' }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                problem:
                  'needs a packages object, where each key is a package name and each value is a version specifier',
              },
            ],
          }),
        );
      });
    });

    it('throws if any of the keys in the "packages" object do not match the names of any workspace packages', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              foo: 'major',
              bar: 'minor',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                lineNumber: 2,
                packageName: 'foo',
                problem: 'is not a package in the project',
                hint: 'Check the name, or remove the line.',
              },
              {
                lineNumber: 3,
                packageName: 'bar',
                problem: 'is not a package in the project',
                hint: 'Check the name, or remove the line.',
              },
            ],
          }),
        );
      });
    });

    it('throws if any one of the values in the "packages" object is an invalid version specifier', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a'),
            b: buildMockPackage('b'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'asdflksdaf',
              b: '1.2...3.',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                lineNumber: 2,
                packageName: 'a',
                problem: '"asdflksdaf" is not a valid version specifier',
                hint: 'Use major, minor, patch, or a version like 1.2.3.',
              },
              {
                lineNumber: 3,
                packageName: 'b',
                problem: '"1.2...3." is not a valid version specifier',
                hint: 'Use major, minor, patch, or a version like 1.2.3.',
              },
            ],
          }),
        );
      });
    });

    it('throws if any one of the values in the "packages" object is a version string that matches the current version of the package', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '1.2.3'),
            b: buildMockPackage('b', '4.5.6'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '1.2.3',
              b: '4.5.6',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                lineNumber: 2,
                packageName: 'a',
                problem: 'is already at version 1.2.3',
                hint: 'Use a higher version, or major, minor, or patch.',
              },
              {
                lineNumber: 3,
                packageName: 'b',
                problem: 'is already at version 4.5.6',
                hint: 'Use a higher version, or major, minor, or patch.',
              },
            ],
          }),
        );
      });
    });

    it('throws if any one of the values in the "packages" object is a version string that is less than the current version of the package', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '1.2.3'),
            b: buildMockPackage('b', '4.5.6'),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '1.2.2',
              b: '4.5.5',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          expect.objectContaining({
            problems: [
              {
                lineNumber: 2,
                packageName: 'a',
                problem: '"1.2.2" is lower than the current version 1.2.3',
                hint: 'Use a higher version, or major, minor, or patch.',
              },
              {
                lineNumber: 3,
                packageName: 'b',
                problem: '"4.5.5" is lower than the current version 4.5.6',
                hint: 'Use a higher version, or major, minor, or patch.',
              },
            ],
          }),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but any of their peer dependents have changes since their latest release and are not listed in the release', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but any of their peer dependents are not listed in the release, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                peerDependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but any of their peer dependents have changes since their latest release and are not listed in the release', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but any of their peer dependents are not listed in the release, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                peerDependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but their peer dependents have changes since their latest release and have their version specified as null in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but their peer dependents have their version specified as null in the release spec, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                peerDependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but their peer dependents have changes since their latest release and have their version specified as null in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but their peer dependents have their version specified as null in the release spec, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                peerDependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its peer dependents are not in the release spec: b
  Add them so they stay compatible, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but any of their direct dependents have changes since their latest release and are not listed in the release', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but any of their direct dependents are not listed in the release, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                dependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but any of their direct dependents have changes since their latest release and are not listed in the release', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but any of their direct dependents are not listed in the release, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                dependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but their direct dependents have changes since their latest release and have their version specified as null in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using the word "major", but their direct dependents have their version specified as null in the release spec, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                dependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but their direct dependents have changes since their latest release and have their version specified as null in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('throws if there are any packages in the release with a major version bump using a literal version, but their direct dependents have their version specified as null in the release spec, even if they have no changes', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
              validatedManifest: {
                dependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  has a major bump, but its direct dependents are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it('does not throw an error if packages in the release with a major version bump using the word "major", have their dependents via "dependencies" with their version specified as "intentionally-skip" in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'major',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('does not throw an error if packages in the release with a major version bump using a literal version, have their dependents via "dependencies" with their version specified as "intentionally-skip" in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: new SemVer('3.0.0'),
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('does not throw an error if packages in the release with a major version bump using the word "major", have their peer dependents with their version specified as "intentionally-skip" in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '1.0.0',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'major',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'major',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it('does not throw an error if packages in the release with a major version bump using a literal version, have their peer dependents with their version specified as "intentionally-skip" in the release spec', async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', '2.1.4', {
              hasChangesSinceLatestRelease: true,
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  a: '2.1.4',
                },
              },
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: '3.0.0',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: new SemVer('3.0.0'),
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it("throws if there are any packages not listed in the release which have changed and are being defined as 'dependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  depends on packages with unreleased changes that are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it("throws if there are any packages not listed in the release which have changed and are being defined as 'peerDependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  depends on packages with unreleased changes that are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it("throws if there are any packages unintentionally skipped from the release which have changed and are being defined as 'dependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  depends on packages with unreleased changes that are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it("throws if there are any packages unintentionally skipped from the release which have changed and are being defined as 'peerDependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
              b: null,
            },
          }),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          `
The release spec has 1 problem:

a
  depends on packages with unreleased changes that are not in the release spec: b
  Add them to the release spec, or set them to intentionally-skip if they can wait.

Fix the release spec and run the tool again. It was kept at:
${releaseSpecificationPath}
`.trim(),
        );
      });
    });

    it("does not throw if there are any packages intentionally skipped from the release which have changed and are being defined as 'dependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'minor',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it("does not throw if there are any packages intentionally skipped from the release which have changed and are being defined as 'peerDependencies' by other packages which are listed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  b: '1.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: true,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
              b: 'intentionally-skip',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'minor',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it("does not throw when any packages defined as 'dependencies' by a listed package in the release are not listed but have not changed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                dependencies: {
                  b: '1.0.0',
                  c: '2.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'minor',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it("does not throw when any packages defined as 'peerDependencies' by a listed package in the release are not listed but have not changed", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', {
              hasChangesSinceLatestRelease: true,
              validatedManifest: {
                peerDependencies: {
                  b: '1.0.0',
                  c: '2.0.0',
                },
              },
            }),
            b: buildMockPackage('b', {
              hasChangesSinceLatestRelease: false,
            }),
          },
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          YAML.stringify({
            packages: {
              a: 'minor',
            },
          }),
        );

        const releaseSpecification = await validateReleaseSpecification(
          project,
          releaseSpecificationPath,
        );

        expect(releaseSpecification).toStrictEqual({
          packages: {
            a: 'minor',
          },
          path: releaseSpecificationPath,
        });
      });
    });

    it("keeps today's line numbers in the new layout", async () => {
      await withSandbox(async (sandbox) => {
        const project = buildMockProject({
          workspacePackages: {
            a: buildMockPackage('a', { hasChangesSinceLatestRelease: true }),
          },
        });
        const template = await generateReleaseSpecificationTemplateForMonorepo({
          modeName: 'legacy',
          candidates: listLegacyCandidates(project),
          isEditorAvailable: true,
        });
        const releaseSpecificationPath = path.join(
          sandbox.directoryPath,
          'release-spec',
        );
        await fs.promises.writeFile(
          releaseSpecificationPath,
          template.replace('  a: null', '  a: foo'),
        );

        await expect(
          validateReleaseSpecification(project, releaseSpecificationPath),
        ).rejects.toThrow(
          [
            'Line 29  a',
            '         "foo" is not a valid version specifier',
            '         Use major, minor, patch, or a version like 1.2.3.',
          ].join('\n'),
        );
      });
    });
  });

  describe('ReleaseSpecificationError', () => {
    const format = {
      name: (text: string): string => `<${text}>`,
      dim: (text: string): string => `(${text})`,
    };

    it('describes each problem with its line, package, problem, and hint', () => {
      const error = new ReleaseSpecificationError({
        problems: [
          {
            lineNumber: 7,
            packageName: 'a',
            problem: '"foo" is not a valid version specifier',
            hint: 'Use major, minor, patch, or a version like 1.2.3.',
          },
          {
            packageName: 'b',
            problem: 'has a major bump',
            hint: 'Add them.',
          },
          {
            problem: 'is not valid YAML',
            hint: 'Fix the syntax: Missing closing "quote at line 1, column 10',
          },
        ],
        specPath: '/path/to/RELEASE_SPEC.yml',
      });

      expect(error.describe(format)).toStrictEqual({
        title: 'The release spec has 3 problems:',
        lines: [
          'Line 7  <a>',
          '        "foo" is not a valid version specifier',
          '        (Use major, minor, patch, or a version like 1.2.3.)',
          '',
          '<b>',
          '  has a major bump',
          '  (Add them.)',
          '',
          'The release spec',
          '  is not valid YAML',
          '  (Fix the syntax: Missing closing "quote at line 1, column 10)',
          '',
          'Fix the release spec and run the tool again. It was kept at:',
          '(/path/to/RELEASE_SPEC.yml)',
        ],
      });
    });

    it('uses the singular for one problem', () => {
      const error = new ReleaseSpecificationError({
        problems: [{ packageName: 'a', problem: 'is not a package' }],
        specPath: '/path/to/RELEASE_SPEC.yml',
      });

      expect(error.describe(format)).toStrictEqual({
        title: 'The release spec has 1 problem:',
        lines: [
          '<a>',
          '  is not a package',
          '',
          'Fix the release spec and run the tool again. It was kept at:',
          '(/path/to/RELEASE_SPEC.yml)',
        ],
      });
      expect(error.message).toBe(
        [
          'The release spec has 1 problem:',
          '',
          'a',
          '  is not a package',
          '',
          'Fix the release spec and run the tool again. It was kept at:',
          '/path/to/RELEASE_SPEC.yml',
        ].join('\n'),
      );
    });
  });
});
