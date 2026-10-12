/**
 * An error thrown when a Changeset summary violates the summary grammar.
 *
 * Carries structured details so consumers can surface precise diagnostics:
 * the 1-based source line, a stable machine-readable rule identifier, and a
 * human-oriented hint describing how to fix the problem.
 */
export class GrammarError extends Error {
  /**
   * The 1-based line number in the summary where the violation occurred.
   */
  readonly line: number;

  /**
   * A stable, machine-readable identifier for the violated grammar rule
   * (e.g. `'unknown-category'`).
   */
  readonly rule: string;

  /**
   * A human-oriented suggestion for how to fix the violation.
   */
  readonly hint: string;

  constructor(message: string, line: number, rule: string, hint: string) {
    super(message);
    this.name = 'GrammarError';
    this.line = line;
    this.rule = rule;
    this.hint = hint;
  }
}

/**
 * Creates a {@link GrammarError} for the given grammar violation.
 *
 * @param line - The 1-based line number where the violation occurred.
 * @param rule - The stable rule identifier.
 * @param hint - A suggestion for how to fix the violation.
 * @param message - The human-readable error message.
 * @returns The constructed grammar error.
 */
export function grammarError(
  line: number,
  rule: string,
  hint: string,
  message: string,
): GrammarError {
  return new GrammarError(message, line, rule, hint);
}
