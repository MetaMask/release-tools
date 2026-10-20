import { parseChangesetFile as parseWithChangesets } from '@changesets/parse';
import { isMap, isScalar, parseDocument } from 'yaml';

import type { LintDiagnostic } from './diagnostics.js';

export type PackageChange = {
  packageName: string;
  bumpType: unknown;
};

export type RecoveredChangesetFile = {
  packageChanges: PackageChange[];
  summary: string;
  summaryStartLine: number;
  diagnostics: Omit<LintDiagnostic, 'path'>[];
  compatibleWithChangesetsParser: boolean;
};

const FRONTMATTER_DELIMITER = '---';

function isFrontmatterDelimiter(line: string): boolean {
  return line.trim() === FRONTMATTER_DELIMITER;
}

function getLineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/u).length;
}

/**
 * Reports whether the installed Changesets parser accepts the file.
 *
 * @param contents - The complete Changeset file contents.
 * @returns The parser error, or `undefined` when the parser accepts the file.
 */
function getChangesetsParserError(contents: string): Error | undefined {
  try {
    parseWithChangesets(contents);
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

function yamlDiagnostic(
  source: string,
  sourceStartLine: number,
  error: { message: string; pos: readonly [number, number] },
): Omit<LintDiagnostic, 'path'> {
  return {
    line: getLineNumber(source, error.pos[0]) + sourceStartLine - 1,
    rule: 'invalid-yaml',
    message: error.message,
    hint: 'Fix the YAML between the frontmatter delimiters.',
  };
}

/**
 * Parses a Changeset file while recovering enough structure to report multiple
 * diagnostics from malformed input.
 *
 * @param contents - The complete Changeset file contents.
 * @returns The recovered file structure and parser diagnostics.
 */
export function parseChangesetFile(contents: string): RecoveredChangesetFile {
  const lines = contents.split(/\r?\n/u);
  const firstContentLine = lines.findIndex((line) => line.trim() !== '');

  if (
    firstContentLine === -1 ||
    !isFrontmatterDelimiter(lines[firstContentLine])
  ) {
    return {
      packageChanges: [],
      summary: contents.trim(),
      summaryStartLine: Math.max(firstContentLine + 1, 1),
      diagnostics: [
        {
          line: Math.max(firstContentLine + 1, 1),
          rule: 'missing-frontmatter',
          message: 'The Changeset file must start with YAML frontmatter.',
          hint: 'Start the file with a `---` frontmatter delimiter.',
        },
      ],
      compatibleWithChangesetsParser:
        getChangesetsParserError(contents) === undefined,
    };
  }

  const closingDelimiter = lines.findIndex(
    (line, index) => index > firstContentLine && isFrontmatterDelimiter(line),
  );
  if (closingDelimiter === -1) {
    return {
      packageChanges: [],
      summary: '',
      summaryStartLine: lines.length + 1,
      diagnostics: [
        {
          line: firstContentLine + 1,
          rule: 'missing-frontmatter-end',
          message: 'The Changeset frontmatter is not closed.',
          hint: 'Add a closing `---` frontmatter delimiter.',
        },
      ],
      compatibleWithChangesetsParser:
        getChangesetsParserError(contents) === undefined,
    };
  }

  const frontmatter = lines
    .slice(firstContentLine + 1, closingDelimiter)
    .join('\n');
  const summaryLines = lines.slice(closingDelimiter + 1);
  const firstSummaryContent = summaryLines.findIndex(
    (line) => line.trim() !== '',
  );
  const summaryStartLine =
    closingDelimiter + 2 + Math.max(firstSummaryContent, 0);
  const summary = summaryLines
    .slice(Math.max(firstSummaryContent, 0))
    .join('\n')
    .trimEnd();
  const document = parseDocument(frontmatter, {
    prettyErrors: false,
  });
  const diagnostics = document.errors.map((error) =>
    yamlDiagnostic(frontmatter, firstContentLine + 2, error),
  );
  const packageChanges: PackageChange[] = [];

  if (document.contents !== null) {
    if (isMap(document.contents)) {
      for (const pair of document.contents.items) {
        const packageName =
          isScalar(pair.key) && typeof pair.key.value === 'string'
            ? pair.key.value
            : String(pair.key?.toJSON());
        packageChanges.push({
          packageName,
          bumpType: pair.value?.toJSON() ?? null,
        });
      }
    } else {
      diagnostics.push({
        line: firstContentLine + 2,
        rule: 'invalid-frontmatter',
        message:
          'The Changeset frontmatter must map package names to bump types.',
        hint: 'Use entries such as `"@metamask/example": patch`.',
      });
    }
  }

  const changesetsParserError = getChangesetsParserError(contents);
  const compatibleWithChangesetsParser = changesetsParserError === undefined;
  if (diagnostics.length === 0 && changesetsParserError) {
    diagnostics.push({
      rule: 'changesets-parser',
      message: changesetsParserError.message,
      hint: 'Use frontmatter accepted by the installed Changesets parser.',
    });
  }

  return {
    packageChanges,
    summary,
    summaryStartLine,
    diagnostics,
    compatibleWithChangesetsParser,
  };
}
