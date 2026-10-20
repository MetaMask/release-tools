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
  const labels = [
    diagnostic.rule && `[${diagnostic.rule}]`,
    diagnostic.packageName && `[package: ${diagnostic.packageName}]`,
    diagnostic.bumpType && `[bump: ${diagnostic.bumpType}]`,
  ].filter(Boolean);
  const prefix = [location, ...labels].filter(Boolean).join(' ');
  const message = singleLine(diagnostic.message);
  const hint = diagnostic.hint ? ` Hint: ${singleLine(diagnostic.hint)}` : '';

  return [prefix ? `${prefix}:` : '', message, hint.trim()]
    .filter(Boolean)
    .join(' ');
}
