import YAML from 'yaml';

import type { Candidate } from './core/candidates.js';
import {
  checkReleaseChoices,
  normalizeReleaseChoices,
  SKIP_PACKAGE_DIRECTIVE,
} from './core/release-rules.js';
import type { ReleaseChoices } from './core/release-rules.js';
import type { VersionSpecifiers } from './core/types.js';
import { Editor } from './editor.js';
import { Project } from './project/project.js';
import { readFile } from './utils/fs.js';
import { debug, wrapError, isObject, runCommand } from './utils/misc-utils.js';

/**
 * User-provided instructions for how to update this project in order to prepare
 * it for a new release.
 *
 * @property packages - A mapping of package names to version specifiers.
 * @property path - The path to the original release specification file.
 */
export type ReleaseSpecification = {
  packages: VersionSpecifiers;
  path: string;
};

/**
 * Generates a skeleton for a release specification, which describes how a
 * project should be updated.
 *
 * @param args - The set of arguments to this function.
 * @param args.candidates - The packages to list in the release spec.
 * @param args.isEditorAvailable - Whether or not an executable can be found on
 * the user's computer to edit the release spec once it is generated.
 * @returns The release specification template.
 */
export async function generateReleaseSpecificationTemplateForMonorepo({
  candidates,
  isEditorAvailable,
}: {
  candidates: Candidate[];
  isEditorAvailable: boolean;
}): Promise<string> {
  const afterEditingInstructions = isEditorAvailable
    ? `
# When you're finished, save this file and close it. The tool will update the
# versions of the packages you've listed and will move the changelog entries to
# a new section.`.trim()
    : `
# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed and will move
# the changelog entries to a new section.`.trim();

  const instructions = `
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
${afterEditingInstructions}
  `.trim();

  if (candidates.length === 0) {
    throw new Error(
      'Could not generate release specification: There are no packages that have changed since their latest release.',
    );
  }

  const packages = candidates.reduce((obj, candidate) => {
    return { ...obj, [candidate.name]: SKIP_PACKAGE_DIRECTIVE };
  }, {});

  return [instructions, YAML.stringify({ packages })].join('\n\n');
}

/**
 * Launches the given editor to allow the user to update the release spec
 * file.
 *
 * @param releaseSpecificationPath - The path to the release spec file.
 * @param editor - Information about the editor.
 * @returns A promise that resolves when the user has completed editing the
 * file, i.e. when the editor process completes.
 */
export async function waitForUserToEditReleaseSpecification(
  releaseSpecificationPath: string,
  editor: Editor,
): Promise<void> {
  debug(
    `Opening release spec file ${releaseSpecificationPath} with editor located at ${editor.path}...`,
  );

  try {
    await runCommand(editor.path, [...editor.args, releaseSpecificationPath], {
      stdio: 'inherit',
    });
  } catch (error) {
    throw wrapError(
      'Encountered an error while waiting for the release spec to be edited.',
      error,
    );
  }
}

/**
 * Looks over the release spec that the user has edited to ensure that:
 *
 * 1. the names of all packages match those within the project; and
 * 2. the version specifiers for each package are valid.
 *
 * @param project - Information about the whole project (e.g., names of packages
 * and where they can found).
 * @param releaseSpecificationPath - The path to the release spec file.
 * @returns The validated release spec.
 * @throws If there are any issues with the file.
 */
export async function validateReleaseSpecification(
  project: Project,
  releaseSpecificationPath: string,
): Promise<ReleaseSpecification> {
  const releaseSpecificationContents = await readFile(releaseSpecificationPath);
  const indexOfFirstUsableLine = releaseSpecificationContents
    .split('\n')
    .findIndex((line) => !/^#|[ ]+/u.test(line));

  let unvalidatedReleaseSpecification: {
    packages: ReleaseChoices;
  };

  const afterwordForAllErrorMessages = [
    "The release spec file has been retained for you to edit again and make the necessary fixes. Once you've done this, re-run this tool.",
    releaseSpecificationPath,
  ].join('\n\n');

  try {
    unvalidatedReleaseSpecification = YAML.parse(
      releaseSpecificationContents,
    ) as { packages: ReleaseChoices };
  } catch (error) {
    throw wrapError(
      [
        'Your release spec does not appear to be valid YAML.',
        afterwordForAllErrorMessages,
      ].join('\n\n'),
      error,
    );
  }

  if (
    !isObject(unvalidatedReleaseSpecification) ||
    unvalidatedReleaseSpecification.packages === undefined
  ) {
    const message = [
      `Your release spec could not be processed because it needs to be an object with a \`packages\` property. The value of \`packages\` must itself be an object, where each key is a workspace package in the project and each value is a version specifier ("major", "minor", or "patch"; or a version string with major, minor, and patch parts, such as "1.2.3").`,
      `Here is the parsed version of the file you provided:`,
      JSON.stringify(unvalidatedReleaseSpecification, null, 2),
      afterwordForAllErrorMessages,
    ].join('\n\n');
    throw new Error(message);
  }

  const errors = checkReleaseChoices(
    project,
    unvalidatedReleaseSpecification.packages,
  ).errors.map(({ message, entryIndex }) => ({
    message,
    lineNumber:
      entryIndex === undefined
        ? undefined
        : indexOfFirstUsableLine + entryIndex + 2,
  }));

  if (errors.length > 0) {
    const message = [
      'Your release spec could not be processed due to the following issues:',
      errors
        .flatMap((error) => {
          const itemPrefix = '* ';

          if (error.lineNumber === undefined) {
            return `${itemPrefix}${String(error.message)}`;
          }

          const lineNumberPrefix = `Line ${error.lineNumber}: `;

          if (Array.isArray(error.message)) {
            return [
              `${itemPrefix}${lineNumberPrefix}${error.message[0]}`,
              ...error.message.slice(1).map((line) => {
                const indentedLineLength =
                  itemPrefix.length + lineNumberPrefix.length + line.length;
                return line.padStart(indentedLineLength, ' ');
              }),
            ];
          }

          return `${itemPrefix}${lineNumberPrefix}${error.message}`;
        })
        .join('\n'),
      afterwordForAllErrorMessages,
    ].join('\n\n');
    throw new Error(message);
  }

  return {
    packages: normalizeReleaseChoices(unvalidatedReleaseSpecification.packages),
    path: releaseSpecificationPath,
  };
}
