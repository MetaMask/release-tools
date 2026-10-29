#!/usr/bin/env node

import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import semver from 'semver';
import type { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { format } from './changelog.js';
import type { Formatter, FormatterName } from './changelog.js';
import { unreleased } from './constants.js';
import type { Version } from './constants.js';
import { readFile, writeFile } from './fs.js';
import { createEmptyChangelog } from './init.js';
import { getProjectRoots } from './project.js';
import { findNearestPackageJson, getRepositoryUrl } from './repo.js';
import type { PackageRename } from './shared-types.js';
import { updateChangelog } from './update-changelog.js';
import { error, validate } from './validate-command/index.js';

const updateEpilog = `New commits will be added to the "${unreleased}" section (or \
to the section for the current release if the '--rc' flag is used) in reverse \
chronological order. Any commits for PRs that are represented already in the \
changelog will be ignored.

If the '--rc' flag is used and the section for the current release does not \
yet exist, it will be created.`;

const validateEpilog = `This does not ensure that the changelog is complete, \
or that each change is in the correct section. It just ensures that the \
formatting is correct. Verification of the contents is left for manual review.`;

/**
 * Determine whether the given URL is valid.
 *
 * @param proposedUrl - The URL to validate.
 * @returns True if the URL is valid, false otherwise.
 */
function isValidUrl(proposedUrl: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(proposedUrl);
    return true;
  } catch {
    return false;
  }
}

type UpdateOptions = {
  changelogPath: string;
  currentVersion?: Version;
  repoUrl: string;
  isReleaseCandidate: boolean;
  projectRootDirectory?: string;
  tagPrefix: string;
  formatter: Formatter;
  autoCategorize: boolean;
  /**
   * The package rename properties, used in case of package is renamed
   */
  packageRename?: PackageRename;
  /**
   * Whether to use `CHANGELOG entry:` from the commit body and the no-changelog label
   */
  useChangelogEntry: boolean;
  /**
   * Whether to use short PR links in the changelog entries
   */
  useShortPrLink: boolean;
  /**
   * Whether to require PR numbers for all commits. If true, commits without PR numbers are filtered out.
   */
  requirePrNumbers: boolean;
  /**
   * Whether to convert recognized leading imperative verbs to past tense.
   */
  normalizeToPastTense: boolean;
  /**
   * Whether to exclude `chore:` commits that lack a changelog entry.
   */
  excludeChoreWithoutChangelogEntry: boolean;
  /**
   * Whether to prevent automatically adding commits older than the target
   * changelog section frontier.
   */
  preventBackfill: boolean;
  /**
   * Whether to print commit-level update diagnostics to stderr.
   */
  verbose: boolean;
};

/**
 * Update the changelog.
 *
 * @param options - Update options.
 * @param options.changelogPath - The path to the changelog file.
 * @param options.currentVersion - The current project version.
 * @param options.isReleaseCandidate - Whether the current branch is a release candidate or not.
 * @param options.repoUrl - The GitHub repository URL for the current project.
 * @param options.projectRootDirectory - The root project directory.
 * @param options.tagPrefix - The prefix used in tags before the version number.
 * @param options.formatter - A custom Markdown formatter to use.
 * @param options.packageRename - The package rename properties. Optional.
 * Only needed when retrieving a changelog for a renamed package
 * (e.g., utils -> @metamask/utils).
 * @param options.autoCategorize - Whether to categorize commits automatically based on their messages.
 * @param options.useChangelogEntry - Whether to read `CHANGELOG entry:` from the commit body and the no-changelog label.
 * @param options.useShortPrLink - Whether to use short PR links in the changelog entries.
 * @param options.requirePrNumbers - Whether to require PR numbers for all commits. If true, commits without PR numbers are filtered out.
 * @param options.normalizeToPastTense - Whether to convert recognized leading imperative verbs to past tense.
 * @param options.excludeChoreWithoutChangelogEntry - Whether to exclude `chore:` commits without a changelog entry.
 * @param options.preventBackfill - Whether to skip commits older than the target changelog section frontier.
 * @param options.verbose - Whether to print commit-level update diagnostics to stderr.
 */
async function update({
  changelogPath,
  currentVersion,
  isReleaseCandidate,
  repoUrl,
  projectRootDirectory,
  tagPrefix,
  formatter,
  packageRename,
  autoCategorize,
  useChangelogEntry,
  useShortPrLink,
  requirePrNumbers,
  normalizeToPastTense,
  excludeChoreWithoutChangelogEntry,
  preventBackfill,
  verbose,
}: UpdateOptions): Promise<void> {
  const changelogContent = await readFile(changelogPath);

  const newChangelogContent = await updateChangelog({
    changelogContent,
    ...(currentVersion !== undefined && { currentVersion }),
    repoUrl,
    isReleaseCandidate,
    ...(projectRootDirectory !== undefined && { projectRootDirectory }),
    tagPrefixes: [tagPrefix],
    formatter,
    ...(packageRename !== undefined && { packageRename }),
    autoCategorize,
    useChangelogEntry,
    useShortPrLink,
    requirePrNumbers,
    normalizeToPastTense,
    excludeChoreWithoutChangelogEntry,
    preventBackfill,
    verbose,
  });

  if (newChangelogContent) {
    await writeFile(changelogPath, newChangelogContent);
    console.log('CHANGELOG.md updated.');
  } else {
    console.log('There are no new commits to add to the changelog.');
  }
}

/**
 * Returns whether an error has an error code or not.
 *
 * @param value - The value to check.
 * @returns True if the value is an Error with a code property, false otherwise.
 */
function hasErrorCode(value: unknown): value is Error & { code: unknown } {
  return (
    value instanceof Error &&
    Object.prototype.hasOwnProperty.call(value, 'code')
  );
}

type InitOptions = {
  changelogPath: string;
  repoUrl: string;
  tagPrefix: string;
};

/**
 * Create a new empty changelog.
 *
 * @param options - Initialization options.
 * @param options.changelogPath - The path to the changelog file.
 * @param options.repoUrl - The GitHub repository URL for the current project.
 * @param options.tagPrefix - The prefix used in tags before the version number.
 */
async function init({
  changelogPath,
  repoUrl,
  tagPrefix,
}: InitOptions): Promise<void> {
  const changelogContent = await createEmptyChangelog({ repoUrl, tagPrefix });
  await writeFile(changelogPath, changelogContent);
}

const rootDescription = `The root project directory. This determines where we \
look for changes since the last release (defaults to the entire repository at \
the current working directory), and where the changelog path is resolved from \
(defaults to the current working directory).`;

/**
 * Configure the `--all` option, which runs a command on the changelog of each
 * workspace package in the Yarn project rather than a single changelog.
 *
 * @param _yargs - The yargs instance to configure.
 * @returns A Yargs instance with the `--all` option.
 */
function configureAllOption(_yargs: Argv): Argv {
  return _yargs.option('all', {
    default: false,
    description: `Run on the changelog of every workspace package in the Yarn project, rather than only the project at the current working directory. Packages without a changelog are skipped. Cannot be combined with '--root', '--currentVersion', '--versionBeforePackageRename', or '--tagPrefixBeforePackageRename'.`,
    type: 'boolean',
  });
}

/**
 * Configure options that are common to all commands.
 *
 * @param _yargs - The yargs instance to configure.
 * @returns A Yargs instance configured with all common commands.
 */
function configureCommonCommandOptions(_yargs: Argv): Argv {
  return _yargs
    .option('file', {
      default: 'CHANGELOG.md',
      description: 'The changelog file path',
      type: 'string',
    })
    .option('repo', {
      default: getRepositoryUrl(),
      description: `The GitHub repository URL`,
      type: 'string',
    })
    .option('root', {
      description: rootDescription,
      type: 'string',
    })
    .option('tagPrefix', {
      defaultDescription: `'v', or '<package name>@' with --all`,
      description: 'The prefix used in tags before the version number.',
      type: 'string',
    })
    .option('versionBeforePackageRename', {
      description: 'A version of the package before being renamed.',
      type: 'string',
    })
    .option('autoCategorize', {
      default: false,
      description:
        'Automatically categorize commits based on Conventional Commits prefixes.',
      type: 'boolean',
    })
    .option('tagPrefixBeforePackageRename', {
      description: 'A tag prefix of the package before being renamed.',
      type: 'string',
    });
}

/**
 * The parsed command-line arguments for all auto-changelog commands.
 */
type CliArguments = {
  file: string;
  repo: string;
  root?: string;
  all: boolean;
  tagPrefix?: string;
  versionBeforePackageRename?: string;
  tagPrefixBeforePackageRename?: string;
  autoCategorize: boolean;
  rc: boolean;
  currentVersion?: string;
  prettier?: boolean;
  formatter: string;
  useChangelogEntry: boolean;
  useShortPrLink: boolean;
  requirePrNumbers: boolean;
  normalizeToPastTense: boolean;
  excludeChoreWithoutChangelogEntry: boolean;
  preventBackfill: boolean;
  verbose: boolean;
  fix: boolean;
  prLinks: boolean;
  checkDeps: boolean;
  fromRef?: string;
  toRef: string;
  remote: string;
  baseBranch?: string;
  currentPr?: string;
  _: (string | number)[];
  $0: string;
};

type RunCommandOptions = {
  argv: CliArguments;
  command: string | number;
  formatter: Formatter;
  /**
   * The root directory of the project to run the command on. When omitted, the
   * command runs on the project at the current working directory.
   */
  projectRootDirectory: string | undefined;
  /**
   * Whether the command runs on every workspace package (`--all`). This changes
   * the default tag prefix to be per package.
   */
  isAll: boolean;
};

/**
 * Run a command on the changelog of a single project.
 *
 * @param options - Options.
 * @param options.argv - The parsed command-line arguments.
 * @param options.command - The command to run.
 * @param options.formatter - The Markdown formatter to use.
 * @param options.projectRootDirectory - The root directory of the project.
 * @param options.isAll - Whether the command runs on every workspace package.
 * @returns A promise that resolves when the command completes.
 */
async function runCommand({
  argv,
  command,
  formatter,
  projectRootDirectory,
  isAll,
}: RunCommandOptions): Promise<void> {
  const {
    file: changelogFilename,
    rc: isReleaseCandidate,
    repo: repoUrl,
    fix,
    versionBeforePackageRename,
    tagPrefixBeforePackageRename,
    autoCategorize,
    prLinks,
    useChangelogEntry,
    useShortPrLink,
    requirePrNumbers,
    normalizeToPastTense,
    excludeChoreWithoutChangelogEntry,
    preventBackfill,
    verbose,
    // Dependency checking options
    checkDeps,
    fromRef,
    toRef,
    remote,
    baseBranch,
    currentPr,
  } = argv;
  let { currentVersion } = argv;
  let { tagPrefix } = argv;

  // When a project root is given, use its `package.json`. Otherwise walk up
  // from the current working directory to the nearest `package.json` (falling
  // back to the cwd itself if none is found, so the error message below still
  // points at a sensible path).
  const manifestPath = projectRootDirectory
    ? path.join(projectRootDirectory, 'package.json')
    : (findNearestPackageJson() ?? path.resolve('package.json'));

  if (!currentVersion || (isAll && tagPrefix === undefined)) {
    try {
      const manifestText = await readFile(manifestPath);
      const manifest = JSON.parse(manifestText) as {
        name?: string;
        version: string;
      };
      currentVersion ??= manifest.version;
      if (tagPrefix === undefined && isAll) {
        if (!manifest.name) {
          return error(
            `Package manifest has no name to derive a tag prefix from: '${manifestPath}'\nSet the tag prefix using the '--tagPrefix' flag.`,
          );
        }
        tagPrefix = `${manifest.name}@`;
      }
    } catch (caughtError) {
      if (hasErrorCode(caughtError)) {
        if (caughtError.code === 'ENOENT') {
          return error(
            `Package manifest not found at path: '${manifestPath}'\nRun this script from the project root directory, or set the project directory using the '--root' flag.`,
          );
        } else if (caughtError.code === 'EACCES') {
          return error(
            `Access to package manifest is forbidden by file access permissions: '${manifestPath}'`,
          );
        }
      }

      if (caughtError instanceof Error && caughtError.name === 'SyntaxError') {
        return error(
          `Package manifest cannot be parsed as JSON: '${manifestPath}'`,
        );
      }
      throw caughtError;
    }
  }
  tagPrefix ??= 'v';

  if (!currentVersion) {
    return error(
      `Version not found. Please set the --currentVersion flag, or run this as an npm script from a project with the 'version' field set.`,
    );
  } else if (currentVersion && semver.valid(currentVersion) === null) {
    return error(`Current version is not valid SemVer: '${currentVersion}'`);
  } else if (!repoUrl) {
    return error(
      `npm package repository URL not found. Please set the '--repo' flag, or run this as an npm script from a project with the 'repository' field set.`,
    );
  } else if (!isValidUrl(repoUrl)) {
    return error(`Invalid repo URL: '${repoUrl}'`);
  }

  if (
    (versionBeforePackageRename && !tagPrefixBeforePackageRename) ||
    (!versionBeforePackageRename && tagPrefixBeforePackageRename)
  ) {
    return error(
      '--version-before-package-rename and --tag-prefix-before-package-rename must be given together or not at all.',
    );
  }

  let changelogPath = changelogFilename;
  if (!path.isAbsolute(changelogFilename) && projectRootDirectory) {
    changelogPath = path.resolve(projectRootDirectory, changelogFilename);
  }

  if (command !== 'init') {
    try {
      // eslint-disable-next-line no-bitwise
      await fs.access(changelogPath, fsConstants.F_OK | fsConstants.W_OK);
    } catch (caughtError) {
      if (hasErrorCode(caughtError) && caughtError.code === 'ENOENT') {
        return error(`File does not exist: '${changelogPath}'`);
      }
      return error(`File is not writable: '${changelogPath}'`);
    }
  }

  if (command === 'update') {
    let packageRename: PackageRename | undefined;
    if (versionBeforePackageRename && tagPrefixBeforePackageRename) {
      packageRename = {
        versionBeforeRename: versionBeforePackageRename,
        tagPrefixBeforeRename: tagPrefixBeforePackageRename,
      };
    }
    await update({
      changelogPath,
      ...(currentVersion !== undefined && { currentVersion }),
      isReleaseCandidate,
      repoUrl,
      ...(projectRootDirectory !== undefined && { projectRootDirectory }),
      tagPrefix,
      formatter,
      ...(packageRename !== undefined && { packageRename }),
      autoCategorize,
      useChangelogEntry: Boolean(useChangelogEntry),
      useShortPrLink: Boolean(useShortPrLink),
      requirePrNumbers: Boolean(requirePrNumbers),
      normalizeToPastTense: Boolean(normalizeToPastTense),
      excludeChoreWithoutChangelogEntry: Boolean(
        excludeChoreWithoutChangelogEntry,
      ),
      preventBackfill: Boolean(preventBackfill),
      verbose: Boolean(verbose),
    });
  } else if (command === 'validate') {
    let packageRename: PackageRename | undefined;
    if (versionBeforePackageRename && tagPrefixBeforePackageRename) {
      packageRename = {
        versionBeforeRename: versionBeforePackageRename,
        tagPrefixBeforeRename: tagPrefixBeforePackageRename,
      };
    }

    if (checkDeps && fix && !currentPr) {
      return error(
        '--currentPr is required when --checkDeps and --fix are both enabled.',
      );
    }

    await validate({
      changelogPath,
      ...(currentVersion !== undefined && { currentVersion }),
      isReleaseCandidate,
      repoUrl,
      tagPrefix,
      fix,
      formatter,
      ...(packageRename !== undefined && { packageRename }),
      ensureValidPrLinksPresent: prLinks,
      checkDeps,
      manifestPath,
      ...(fromRef !== undefined && { fromRef }),
      toRef,
      remote,
      ...(baseBranch !== undefined && { baseBranch }),
      ...(currentPr !== undefined && { currentPr }),
    });
  } else if (command === 'init') {
    await init({
      changelogPath,
      repoUrl,
      tagPrefix,
    });
  }
}

/**
 * Run a command on the changelog of every workspace package in the Yarn
 * project at the current working directory. Packages without a changelog are
 * skipped. If the project has no workspaces besides the root, the root package
 * is used.
 *
 * @param options - Options.
 * @param options.argv - The parsed command-line arguments.
 * @param options.command - The command to run.
 * @param options.formatter - The Markdown formatter to use.
 * @returns A promise that resolves when the command completes on every package.
 */
async function runCommandOnAllPackages({
  argv,
  command,
  formatter,
}: Omit<RunCommandOptions, 'projectRootDirectory' | 'isAll'>): Promise<void> {
  const unsupportedOptions = [
    ['--root', argv.root],
    ['--currentVersion', argv.currentVersion],
    ['--versionBeforePackageRename', argv.versionBeforePackageRename],
    ['--tagPrefixBeforePackageRename', argv.tagPrefixBeforePackageRename],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([name]) => `"${name}"`);

  if (unsupportedOptions.length > 0) {
    return error(
      `The "--all" flag cannot be combined with ${unsupportedOptions.join(', ')}.`,
    );
  }

  const { repoRoot, packageRoots } = await getProjectRoots(process.cwd());
  const projectRoots = packageRoots.length > 0 ? packageRoots : [repoRoot];

  for (const projectRoot of projectRoots) {
    const displayName = path.relative(repoRoot, projectRoot) || '.';
    const changelogPath = path.resolve(projectRoot, argv.file);

    try {
      await fs.access(changelogPath, fsConstants.F_OK);
    } catch {
      console.log(`Skipping "${displayName}": No "${argv.file}" found.`);
      continue;
    }

    console.log(`\n${displayName}`);
    await runCommand({
      argv,
      command,
      formatter,
      projectRootDirectory: projectRoot,
      isAll: true,
    });
  }
}

/**
 * The entrypoint for the auto-changelog CLI.
 *
 * @returns A promise that resolves when the selected command completes.
 */
async function main(): Promise<void> {
  // Yargs cannot infer subcommand option types from a shared `argv`.
  const argv = (await yargs(hideBin(process.argv))
    .command(
      'update',
      'Update CHANGELOG.md with any changes made since the most recent release.\nUsage: $0 update [options]',
      (_yargs) =>
        configureAllOption(configureCommonCommandOptions(_yargs))
          .option('rc', {
            default: false,
            description: `Add new changes to the current release header, rather than to the '${unreleased}' section.`,
            type: 'boolean',
          })
          .option('currentVersion', {
            description:
              'The current version of the project that the changelog belongs to.',
            type: 'string',
          })
          .option('autoCategorize', {
            default: false,
            description:
              'Automatically categorize commits based on their messages.',
          })
          .option('prettier', {
            description: `Expect the changelog to be formatted with Prettier.`,
            deprecated: 'Use "--formatter prettier" instead.',
            type: 'boolean',
          })
          .option('formatter', {
            description: 'The formatter to use for formatting the changelog.',
            choices: ['prettier', 'oxfmt'],
            default: 'prettier',
            type: 'string',
          })
          .option('useChangelogEntry', {
            default: false,
            description:
              'Read `CHANGELOG entry:` from the commit body and the no-changelog label',
            type: 'boolean',
          })
          .option('useShortPrLink', {
            default: false,
            description: 'Use short PR links in the changelog entries',
            type: 'boolean',
          })
          .option('requirePrNumbers', {
            default: false,
            description:
              'Only include commits with PR numbers in the changelog. Commits without PR numbers will be filtered out',
            type: 'boolean',
          })
          .option('normalizeToPastTense', {
            default: false,
            description:
              'Convert recognized leading imperative verbs to past tense.',
            type: 'boolean',
          })
          .option('excludeChoreWithoutChangelogEntry', {
            default: false,
            description:
              'Exclude chore commits that do not have a CHANGELOG entry.',
            type: 'boolean',
          })
          .option('preventBackfill', {
            default: false,
            description:
              'Skip commits older than an entry in the target changelog section.',
            type: 'boolean',
          })
          .option('verbose', {
            default: false,
            description: 'Print commit-level changelog update diagnostics.',
            type: 'boolean',
          })
          .epilog(updateEpilog),
    )
    .command(
      'validate',
      'Validate the changelog, ensuring that it is well-formatted.\nUsage: $0 validate [options]',
      (_yargs) =>
        configureAllOption(configureCommonCommandOptions(_yargs))
          .option('rc', {
            default: false,
            description: `Verify that the current version has a release header in the changelog`,
            type: 'boolean',
          })
          .option('currentVersion', {
            description:
              'The current version of the project that the changelog belongs to.',
            type: 'string',
          })
          .option('fix', {
            default: false,
            description: `Attempt to fix any formatting errors in the changelog`,
            type: 'boolean',
          })
          .option('prettier', {
            description: `Expect the changelog to be formatted with Prettier.`,
            deprecated: 'Use "--formatter prettier" instead.',
            type: 'boolean',
          })
          .option('formatter', {
            description: 'The formatter to use for formatting the changelog.',
            choices: ['prettier', 'oxfmt', 'none'],
            default: 'none',
            type: 'string',
          })
          .option('prLinks', {
            default: false,
            description:
              'Verify that each changelog entry has one or more links to associated pull requests within the repository',
            type: 'boolean',
          })
          // Dependency bump checking options
          .option('checkDeps', {
            default: false,
            description:
              'Check that changelog has entries for dependency version bumps.',
            type: 'boolean',
          })
          .option('fromRef', {
            describe:
              'Starting git reference for dependency checking. If not provided, auto-detects from merge base with the base branch.',
            type: 'string',
          })
          .option('toRef', {
            describe: 'Ending git reference for dependency checking.',
            type: 'string',
            default: 'HEAD',
          })
          .option('remote', {
            alias: 'r',
            describe:
              'Remote name for auto-detecting the base branch (used with --checkDeps).',
            default: 'origin',
            type: 'string',
          })
          .option('baseBranch', {
            alias: 'b',
            describe:
              "Base branch reference to compare against (defaults to <remote>/main). For stacked PRs (branch off a branch), set this to the parent branch so only the current branch's changes are checked.",
            type: 'string',
          })
          .option('currentPr', {
            describe:
              'PR number to use in changelog entries. Required when --checkDeps and --fix are both enabled.',
            type: 'string',
          })
          .epilog(validateEpilog),
    )
    .command('init', 'Initialize a new empty changelog', (_yargs) => {
      configureCommonCommandOptions(_yargs);
    })
    .strict()
    .demandCommand()
    .help('help')
    .usage(
      `Utilities for validating and updating "Keep a Changelog" formatted changelogs.\nUsage: $0 [command] [options]`,
    )
    .parse()) as CliArguments;

  const {
    all,
    root: projectRootDirectory,
    prettier: usePrettier,
    formatter: formatterOption,
  } = argv;

  if (!argv._) {
    throw new Error('No command provided.');
  }

  const command = argv._[0];
  const formatter = async (changelog: string): Promise<string> => {
    // If the deprecated `--prettier` flag is used, it takes precedence over the
    // `--formatter` option. Otherwise, use the specified formatter, unless it's
    // "none".
    if (typeof usePrettier === 'boolean') {
      if (usePrettier) {
        return await format(changelog, 'prettier');
      }

      return changelog;
    }

    if (formatterOption && formatterOption !== 'none') {
      return await format(changelog, formatterOption as FormatterName);
    }

    return changelog;
  };

  if (all) {
    return await runCommandOnAllPackages({ argv, command, formatter });
  }

  if (projectRootDirectory) {
    try {
      const stat = await fs.stat(projectRootDirectory);
      if (!stat.isDirectory()) {
        return error(
          `Project root must be a directory: "${projectRootDirectory}".`,
        );
      }
    } catch (caughtError) {
      if (hasErrorCode(caughtError)) {
        if (caughtError.code === 'ENOENT') {
          return error(
            `Root directory specified does not exist: "${projectRootDirectory}".`,
          );
        } else if (caughtError.code === 'EACCES') {
          return error(
            `Access to root directory is forbidden by file access permissions: "${projectRootDirectory}".`,
          );
        }
      }
      throw caughtError;
    }
  }

  await runCommand({
    argv,
    command,
    formatter,
    projectRootDirectory,
    isAll: false,
  });
}

await main();
