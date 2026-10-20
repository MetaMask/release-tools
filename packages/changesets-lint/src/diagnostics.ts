export type LintDiagnostic = {
  path?: string;
  line?: number;
  rule?: string;
  packageName?: string;
  bumpType?: string;
  message: string;
  hint?: string;
};

function singleLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
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
  const details = [
    diagnostic.rule ? `[${diagnostic.rule}]` : undefined,
    diagnostic.packageName ? `[package: ${diagnostic.packageName}]` : undefined,
    diagnostic.bumpType ? `[bump: ${diagnostic.bumpType}]` : undefined,
  ].filter((value) => value !== undefined);
  const prefix = [location, ...details].filter(Boolean).join(' ');
  const hint = diagnostic.hint ? ` Hint: ${singleLine(diagnostic.hint)}` : '';

  return `${prefix ? `${prefix}: ` : ''}${singleLine(
    diagnostic.message,
  )}${hint}`;
}
