export type LintDiagnostic = {
  path?: string;
  line?: number;
  rule?: string;
  packageName?: string;
  bumpType?: string;
  message: string;
  hint?: string;
};

/**
 * Replaces whitespace sequences with single spaces.
 *
 * @param value - The value to normalize.
 * @returns The normalized single-line value.
 */
function singleLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/**
 * Checks whether a value is a non-empty string.
 *
 * @param value - The value to check.
 * @returns Whether the value is a non-empty string.
 */
function isNotEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * Formats a lint diagnostic as one human-readable line.
 *
 * @param diagnostic - The diagnostic to format.
 * @returns The formatted diagnostic.
 */
export function formatDiagnostic(diagnostic: LintDiagnostic): string {
  const location = [diagnostic.path, diagnostic.line]
    .filter((value) => value !== undefined)
    .join(':');
  const message = singleLine(diagnostic.message);
  const fix = diagnostic.hint
    ? `(Fix: ${singleLine(diagnostic.hint)})`
    : undefined;

  return [location ? `${location}:` : '', message, fix]
    .filter(isNotEmpty)
    .join(' ');
}
