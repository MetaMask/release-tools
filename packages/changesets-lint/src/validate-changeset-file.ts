import {
  GrammarError,
  parseChangesetSummary,
} from '@metamask/changesets-utils';

import type { LintDiagnostic } from './diagnostics.js';
import { parseChangesetFile } from './parse-changeset-file.js';

const VALID_BUMP_TYPES = new Set(['major', 'minor', 'patch']);

/**
 * Formats an invalid bump type without hiding its data type.
 *
 * @param bumpType - The invalid bump type.
 * @returns The formatted bump type.
 */
function formatBumpType(bumpType: unknown): string {
  if (typeof bumpType === 'string') {
    return bumpType === '' ? JSON.stringify(bumpType) : bumpType;
  }

  return String(JSON.stringify(bumpType));
}

export type ValidateChangesetFileOptions = {
  path: string;
  contents: string;
  workspacePackageNames: ReadonlySet<string>;
};

/**
 * Validates one Changeset file against MetaMask conventions.
 *
 * @param options - The file and workspace information to validate.
 * @param options.path - The path to report in diagnostics.
 * @param options.contents - The complete Changeset file contents.
 * @param options.workspacePackageNames - The valid workspace package names.
 * @returns All diagnostics that can be recovered from the file.
 */
export function validateChangesetFile({
  path,
  contents,
  workspacePackageNames,
}: ValidateChangesetFileOptions): LintDiagnostic[] {
  const parsed = parseChangesetFile(contents);
  const diagnostics: LintDiagnostic[] = parsed.diagnostics.map(
    (diagnostic) => ({ path, ...diagnostic }),
  );

  if (
    parsed.diagnostics.some(
      (diagnostic) =>
        diagnostic.rule === 'missing-frontmatter' ||
        diagnostic.rule === 'missing-frontmatter-end',
    )
  ) {
    return diagnostics;
  }

  if (parsed.packageChanges.length === 0) {
    diagnostics.push({
      path,
      rule: 'missing-package-changes',
      message: 'The Changeset must include at least one package change.',
      hint: 'Add a workspace package and its major, minor, or patch bump type.',
    });
  }

  let hasInvalidBumpType = false;
  for (const packageChange of parsed.packageChanges) {
    const { packageName, bumpType } = packageChange;
    if (!workspacePackageNames.has(packageName)) {
      diagnostics.push({
        path,
        rule: 'unknown-package',
        packageName,
        message: `The package ${packageName} is not in this workspace.`,
        hint: 'Use the name of a package in the current workspace.',
      });
    }

    if (typeof bumpType !== 'string' || !VALID_BUMP_TYPES.has(bumpType)) {
      hasInvalidBumpType = true;
      diagnostics.push({
        path,
        rule: 'invalid-bump-type',
        packageName,
        bumpType: formatBumpType(bumpType),
        message: `The bump type for ${packageName} is not supported.`,
        hint: 'Use major, minor, or patch.',
      });
    }
  }

  if (hasInvalidBumpType) {
    const parserDiagnosticIndex = diagnostics.findIndex(
      (diagnostic) =>
        diagnostic.rule === 'changesets-parser' &&
        /invalid (?:release|version) type/u.test(diagnostic.message),
    );
    if (parserDiagnosticIndex !== -1) {
      diagnostics.splice(parserDiagnosticIndex, 1);
    }
  }

  try {
    parseChangesetSummary(parsed.summary);
  } catch (error) {
    /* istanbul ignore if -- The summary parser's public contract only throws GrammarError. */
    if (!(error instanceof GrammarError)) {
      throw error;
    }

    diagnostics.push({
      path,
      line: parsed.summaryStartLine + error.line - 1,
      rule: error.rule,
      message: error.message,
      hint: error.hint,
    });
  }

  return diagnostics;
}
