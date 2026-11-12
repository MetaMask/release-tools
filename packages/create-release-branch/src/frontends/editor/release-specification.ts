import YAML, { YAMLMap, YAMLParseError } from 'yaml';

import type { Candidate } from '../../core/candidates.js';
import type { CliOutput } from '../../core/cli-output.js';
import type { ModeName } from '../../core/mode.js';
import { SKIP_PACKAGE_DIRECTIVE } from '../../core/release-rules.js';
import type {
  ReleaseChoiceError,
  ReleaseChoices,
} from '../../core/release-rules.js';
import type { ErrorDescription } from '../../core/user-facing-error.js';
import { UserFacingError } from '../../core/user-facing-error.js';
import { readFile } from '../../utils/fs.js';
import {
  debug,
  wrapError,
  isObject,
  runCommand,
} from '../../utils/misc-utils.js';
import { semver, SemVer } from '../../utils/semver.js';
import { Editor } from './editor.js';

/**
 * The text of the release spec template that depends on the release mode.
 *
 * @property instructions - The comments at the top of the template, before
 * the instructions for when the user has finished editing.
 * @property afterEditingWithEditor - What happens once the user closes the
 * editor.
 * @property afterEditingWithoutEditor - What the user does once they have
 * edited the file in their own editor.
 * @property noCandidatesMessage - The error message when there are no
 * packages to list.
 */
type TemplateText = {
  instructions: string;
  afterEditingWithEditor: string;
  afterEditingWithoutEditor: string;
  noCandidatesMessage: string;
};

const TEMPLATE_TEXT_BY_MODE: Record<ModeName, TemplateText> = {
  legacy: {
    instructions: `
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
#`.trim(),
    afterEditingWithEditor: `
# When you're finished, save this file and close it. The tool will update the
# versions of the packages you've listed and will move the changelog entries to
# a new section.`.trim(),
    afterEditingWithoutEditor: `
# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed and will move
# the changelog entries to a new section.`.trim(),
    noCandidatesMessage:
      'Could not generate release specification: There are no packages that have changed since their latest release.',
  },
  changesets: {
    instructions: `
# This file (called the "release spec") allows you to specify which packages you
# want to include in this release along with the new versions they should
# receive.
#
# The packages below have pending Changesets, or are bumped because a package
# they depend on is released. The value after each package is the version
# specifier that the Changesets give, and the comment after it shows the new
# version. Do not change the value. In Changesets mode, the Changesets set the
# version of each package.
#
# To leave a package out of this release, remove it from this list. Its
# Changesets are kept for a later release.
#`.trim(),
    afterEditingWithEditor: `
# When you're finished, save this file and close it. The tool will update the
# versions of the packages you've listed, write their changelogs from the
# Changesets, and delete the Changesets that the release uses.`.trim(),
    afterEditingWithoutEditor: `
# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed, write their
# changelogs from the Changesets, and delete the Changesets that the release
# uses.`.trim(),
    noCandidatesMessage:
      'Could not generate release specification: There are no pending Changesets.',
  },
};

/**
 * Proposes the version specifier of a candidate: the bump type that gives its
 * planned version, or else the planned version.
 *
 * @param candidate - The candidate.
 * @returns The version specifier, or `null` if no version is planned.
 */
function proposeVersionSpecifier(candidate: Candidate): string | null {
  const { currentVersion, plannedVersion } = candidate;
  if (plannedVersion === undefined) {
    return SKIP_PACKAGE_DIRECTIVE;
  }
  const bump = semver.diff(currentVersion, plannedVersion);
  return (bump === 'major' || bump === 'minor' || bump === 'patch') &&
    new SemVer(currentVersion).inc(bump).version === plannedVersion
    ? bump
    : plannedVersion;
}

/**
 * Describes a candidate in the comment after its line in the release spec.
 *
 * @param candidate - The candidate.
 * @returns The comment, or undefined if there is nothing to say.
 */
function describeCandidate(candidate: Candidate): string | undefined {
  const { currentVersion, plannedVersion, changeCount } = candidate;
  if (plannedVersion === undefined) {
    return undefined;
  }
  const versions = `${currentVersion} -> ${plannedVersion}`;
  if (changeCount === undefined) {
    return versions;
  }
  return `${versions}, ${changeCount} ${changeCount === 1 ? 'changeset' : 'changesets'}`;
}

/**
 * A problem in the release spec.
 *
 * @property lineNumber - The line of the release spec that has the problem.
 * @property packageName - The name of the package that has the problem.
 * @property problem - What is wrong, written to follow the package name, or
 * "The release spec" if there is no package.
 * @property hint - How to fix it.
 */
export type ReleaseSpecificationProblem = {
  lineNumber?: number;
  packageName?: string;
  problem: string;
  hint?: string;
};

/**
 * The problems in a release spec that the user has edited. The release spec
 * is kept, so the user can fix it and run the tool again.
 */
export class ReleaseSpecificationError extends UserFacingError {
  problems: ReleaseSpecificationProblem[];

  specPath: string;

  /**
   * Creates the error.
   *
   * @param args - The arguments.
   * @param args.problems - The problems in the release spec.
   * @param args.specPath - The path to the release spec.
   * @param options - The options.
   * @param options.cause - The error that caused the problems.
   */
  constructor(
    {
      problems,
      specPath,
    }: { problems: ReleaseSpecificationProblem[]; specPath: string },
    options?: { cause: unknown },
  ) {
    super(undefined, options);
    this.problems = problems;
    this.specPath = specPath;
    const { title, lines } = this.describe({
      name: (text) => text,
      dim: (text) => text,
    });
    this.message = [title, '', ...lines].join('\n');
  }

  describe(format: CliOutput['format']): ErrorDescription {
    const count = this.problems.length;
    const title = `The release spec has ${count} ${count === 1 ? 'problem' : 'problems'}:`;
    const problemLines = this.problems.map(
      ({ lineNumber, packageName, problem, hint }) => {
        const subject =
          packageName === undefined
            ? 'The release spec'
            : format.name(packageName);
        const linePrefix =
          lineNumber === undefined ? '' : `Line ${lineNumber}  `;
        const indent = ' '.repeat(Math.max(linePrefix.length, 2));
        return [
          `${linePrefix}${subject}`,
          `${indent}${problem}`,
          ...(hint === undefined ? [] : [`${indent}${format.dim(hint)}`]),
        ];
      },
    );

    return {
      title,
      lines: [
        ...problemLines.flatMap((lines) => [...lines, '']),
        'Fix the release spec and run the tool again. It was kept at:',
        format.dim(this.specPath),
      ],
    };
  }
}

/**
 * Generates a skeleton for a release specification, which describes how a
 * project should be updated.
 *
 * @param args - The set of arguments to this function.
 * @param args.modeName - The name of the release mode, which picks the
 * instructions and the error message when there are no packages.
 * @param args.candidates - The packages to list in the release spec, with
 * their proposed version specifiers.
 * @param args.isEditorAvailable - Whether or not an executable can be found on
 * the user's computer to edit the release spec once it is generated.
 * @returns The release specification template.
 */
export async function generateReleaseSpecificationTemplateForMonorepo({
  modeName,
  candidates,
  isEditorAvailable,
}: {
  modeName: ModeName;
  candidates: Candidate[];
  isEditorAvailable: boolean;
}): Promise<string> {
  const templateText = TEMPLATE_TEXT_BY_MODE[modeName];
  const afterEditingInstructions = isEditorAvailable
    ? templateText.afterEditingWithEditor
    : templateText.afterEditingWithoutEditor;
  const instructions = [
    templateText.instructions,
    afterEditingInstructions,
  ].join('\n');

  if (candidates.length === 0) {
    throw new Error(templateText.noCandidatesMessage);
  }

  const document = new YAML.Document({});
  const packages = new YAMLMap();
  for (const candidate of candidates) {
    const value = document.createNode(proposeVersionSpecifier(candidate));
    const comment = describeCandidate(candidate);
    if (comment !== undefined) {
      value.comment = ` ${comment}`;
    }
    packages.add(document.createPair(candidate.name, value));
  }
  document.set('packages', packages);

  return [instructions, document.toString()].join('\n\n');
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
 * Reads the release spec that the user has edited and checks the release
 * choices in it, for example:
 *
 * 1. the names of all packages match those within the project; and
 * 2. the version specifiers for each package are valid.
 *
 * @param releaseSpecificationPath - The path to the release spec file.
 * @param check - Checks the release choices. It returns the plan only when
 * there are no errors.
 * @returns The plan that `check` returns.
 * @throws A `ReleaseSpecificationError` if there are any issues with the file.
 */
export async function validateReleaseSpecification<Plan>(
  releaseSpecificationPath: string,
  check: (
    choices: ReleaseChoices,
  ) => Promise<{ errors: ReleaseChoiceError[] } | { plan: Plan }>,
): Promise<Plan> {
  const releaseSpecificationContents = await readFile(releaseSpecificationPath);
  const indexOfFirstUsableLine = releaseSpecificationContents
    .split('\n')
    .findIndex((line) => !/^#|[ ]+/u.test(line));

  let unvalidatedReleaseSpecification: {
    packages: ReleaseChoices;
  };

  try {
    unvalidatedReleaseSpecification = YAML.parse(
      releaseSpecificationContents,
    ) as { packages: ReleaseChoices };
  } catch (error) {
    if (!(error instanceof YAMLParseError)) {
      throw error;
    }

    const [firstLineOfMessage] = error.message.split('\n');
    throw new ReleaseSpecificationError(
      {
        problems: [
          {
            problem: 'is not valid YAML',
            hint: `Fix the syntax: ${firstLineOfMessage.replace(/:$/u, '')}`,
          },
        ],
        specPath: releaseSpecificationPath,
      },
      { cause: error },
    );
  }

  if (
    !isObject(unvalidatedReleaseSpecification) ||
    unvalidatedReleaseSpecification.packages === undefined
  ) {
    throw new ReleaseSpecificationError({
      problems: [
        {
          problem:
            'needs a packages object, where each key is a package name and each value is a version specifier',
        },
      ],
      specPath: releaseSpecificationPath,
    });
  }

  const result = await check(unvalidatedReleaseSpecification.packages);

  if (!('plan' in result)) {
    throw new ReleaseSpecificationError({
      problems: result.errors.map(({ entryIndex, ...problem }) =>
        entryIndex === undefined
          ? problem
          : { lineNumber: indexOfFirstUsableLine + entryIndex + 2, ...problem },
      ),
      specPath: releaseSpecificationPath,
    });
  }

  return result.plan;
}
